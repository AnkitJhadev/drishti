import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { prisma } from '../db/prisma'
import {
  emitRecommendationReady,
  emitAlertNew,
  emitTowerStatusChanged,
} from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { IssueType } from '../types/complaint'
import type { TowerStatus } from '../types/tower'
import type { AlertType, AlertSeverity } from '../types/alert'

// ── Types ─────────────────────────────────────────────────────────────────
interface ComplaintRow {
  id: string
  issue_type: IssueType
  severity: string
  lat: number | null
  lng: number | null
  location_hint: string | null
  raw_text: string
  tower_id: string | null
}

interface TowerRow {
  id: string
  name: string
  lat: number
  lng: number
  status: string
  coverage_radius_km: number
}

interface ClusterGroup {
  issue_type: IssueType
  complaint_ids: string[]
  center_lat: number
  center_lng: number
  tower_id: string | null
}

// ── Haversine distance in km ──────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Simple geographic + issue-type clustering ─────────────────────────────
// Groups complaints within 5km of each other with the same issue type
function clusterComplaints(complaints: ComplaintRow[]): ClusterGroup[] {
  const withCoords = complaints.filter((c) => c.lat !== null && c.lng !== null)
  const visited = new Set<string>()
  const clusters: ClusterGroup[] = []

  for (const complaint of withCoords) {
    if (visited.has(complaint.id)) continue

    // Find all neighbours within 5km with the same issue type
    const neighbours = withCoords.filter(
      (c) =>
        !visited.has(c.id) &&
        c.issue_type === complaint.issue_type &&
        haversineKm(complaint.lat!, complaint.lng!, c.lat!, c.lng!) <= 5
    )

    if (neighbours.length < 2) continue   // need at least 2 to form a cluster

    neighbours.forEach((c) => visited.add(c.id))

    const centerLat = neighbours.reduce((s, c) => s + c.lat!, 0) / neighbours.length
    const centerLng = neighbours.reduce((s, c) => s + c.lng!, 0) / neighbours.length

    clusters.push({
      issue_type: complaint.issue_type,
      complaint_ids: neighbours.map((c) => c.id),
      center_lat: centerLat,
      center_lng: centerLng,
      tower_id: null,
    })
  }

  return clusters
}

// ── Find nearest tower to a cluster centroid ──────────────────────────────
function findNearestTower(
  centerLat: number,
  centerLng: number,
  towers: TowerRow[]
): TowerRow | null {
  let nearest: TowerRow | null = null
  let minDist = Infinity

  for (const tower of towers) {
    const dist = haversineKm(centerLat, centerLng, tower.lat, tower.lng)
    if (dist < minDist && dist <= tower.coverage_radius_km * 3) {
      minDist = dist
      nearest = tower
    }
  }

  return nearest
}

// ── Tool definitions ──────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_recent_complaints',
    description: 'Fetch recent clustered complaints that have not yet been pattern-analyzed',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max complaints to fetch (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'create_cluster',
    description: 'Save a detected complaint cluster to the database',
    input_schema: {
      type: 'object' as const,
      properties: {
        issue_type:    { type: 'string' },
        complaint_ids: { type: 'array', items: { type: 'string' } },
        center_lat:    { type: 'number' },
        center_lng:    { type: 'number' },
        radius_km:     { type: 'number' },
        tower_id:      { type: 'string' },
      },
      required: ['issue_type', 'complaint_ids', 'center_lat', 'center_lng', 'radius_km'],
    },
  },
  {
    name: 'generate_recommendation',
    description: 'Generate and save an AI recommendation for a cluster',
    input_schema: {
      type: 'object' as const,
      properties: {
        cluster_id:      { type: 'string' },
        tower_id:        { type: 'string' },
        root_cause:      { type: 'string', description: 'Root cause analysis based on complaint patterns' },
        suggested_action:{ type: 'string', description: 'Specific actionable recommendation for the field team' },
        affected_users:  { type: 'number' },
        priority:        { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        confidence:      { type: 'number' },
      },
      required: ['cluster_id', 'root_cause', 'suggested_action', 'affected_users', 'priority', 'confidence'],
    },
  },
  {
    name: 'create_alert',
    description: 'Create a real-time alert for operators',
    input_schema: {
      type: 'object' as const,
      properties: {
        type:     { type: 'string', enum: ['new_cluster', 'tower_degraded', 'spike_detected', 'recommendation_ready', 'approval_pending'] },
        severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
        title:    { type: 'string' },
        message:  { type: 'string' },
        tower_id: { type: 'string' },
        cluster_id: { type: 'string' },
        action_required: { type: 'boolean' },
      },
      required: ['type', 'severity', 'title', 'message', 'action_required'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────
async function toolExecutor(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (name === 'get_recent_complaints') {
    const limit = (input.limit as number) ?? 50
    const rawRows = await prisma.complaints.findMany({
      where: { status: 'clustered', issue_type: { not: null } },
      select: { id: true, issue_type: true, severity: true, lat: true, lng: true, location_hint: true, raw_text: true, tower_id: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })
    const rows: ComplaintRow[] = rawRows.map((r) => ({
      id: r.id,
      issue_type: (r.issue_type ?? 'unknown') as IssueType,
      severity: r.severity ?? 'low',
      lat: r.lat,
      lng: r.lng,
      location_hint: r.location_hint,
      raw_text: r.raw_text,
      tower_id: r.tower_id,
    }))

    const towerRows = await prisma.towers.findMany({
      select: { id: true, name: true, lat: true, lng: true, status: true, coverage_radius_km: true },
    })
    const towers: TowerRow[] = towerRows.map((t) => ({
      id: t.id, name: t.name, lat: t.lat, lng: t.lng,
      status: t.status ?? 'operational',
      coverage_radius_km: t.coverage_radius_km ?? 2,
    }))

    const clusters = clusterComplaints(rows)

    // Correlate each cluster to nearest tower
    for (const cluster of clusters) {
      const nearest = findNearestTower(cluster.center_lat, cluster.center_lng, towers)
      if (nearest) cluster.tower_id = nearest.id
    }

    return { complaints: rows, clusters, towers }
  }

  if (name === 'create_cluster') {
    const {
      issue_type, complaint_ids, center_lat, center_lng,
      radius_km, tower_id
    } = input as {
      issue_type: string
      complaint_ids: string[]
      center_lat: number
      center_lng: number
      radius_km: number
      tower_id?: string
    }

    const clusterId = await prisma.$transaction(async (tx) => {
      const cluster = await tx.clusters.create({
        data: { issue_type, size: complaint_ids.length, center_lat, center_lng, radius_km, tower_id: tower_id ?? null },
        select: { id: true },
      })
      const id = cluster.id

      // Link complaints to this cluster (COALESCE: keep existing tower if none given).
      await tx.complaints.updateMany({
        where: { id: { in: complaint_ids } },
        data: { cluster_id: id, status: 'recommended', ...(tower_id ? { tower_id } : {}) },
      })

      // Bump the tower's counters and recalculate status from the new count.
      // Thresholds: 0 → operational, 1–4 → degraded, 5+ → critical.
      // Never downgrade a tower that is already offline (manually set).
      if (tower_id) {
        const t = await tx.towers.findUnique({
          where: { id: tower_id },
          select: { active_complaints: true, affected_users: true, status: true },
        })
        if (t) {
          const newActive = (t.active_complaints ?? 0) + complaint_ids.length
          const newAffected = (t.affected_users ?? 0) + complaint_ids.length * 150
          const newStatus =
            t.status === 'offline' ? 'offline' : newActive >= 5 ? 'critical' : newActive >= 1 ? 'degraded' : 'operational'
          await tx.towers.update({
            where: { id: tower_id },
            data: { active_complaints: newActive, affected_users: newAffected, status: newStatus },
          })
        }
      }

      return id
    })

    logger.info(`Cluster created: ${clusterId} — ${issue_type} (${(complaint_ids as string[]).length} complaints)`)
    return { ok: true, cluster_id: clusterId }
  }

  if (name === 'generate_recommendation') {
    const {
      cluster_id, tower_id, root_cause, suggested_action,
      affected_users, priority, confidence
    } = input as {
      cluster_id: string
      tower_id?: string
      root_cause: string
      suggested_action: string
      affected_users: number
      priority: string
      confidence: number
    }

    const created = await prisma.recommendations.create({
      data: { cluster_id, tower_id: tower_id ?? null, root_cause, suggested_action, affected_users, priority, confidence },
      select: { id: true },
    })

    // Degrade tower status if priority is high/critical (only if still operational)
    if (tower_id && (priority === 'high' || priority === 'critical')) {
      const newStatus: TowerStatus = priority === 'critical' ? 'critical' : 'degraded'
      await prisma.towers.updateMany({ where: { id: tower_id, status: 'operational' }, data: { status: newStatus } })
      emitTowerStatusChanged(tower_id, newStatus)
    }

    // Emit the recommendation live to the approval panel
    emitRecommendationReady({
      id: created.id,
      cluster_id,
      tower_id: tower_id ?? '',
      root_cause,
      suggested_action,
      affected_users,
      priority,
      confidence,
      status: 'pending',
      created_at: new Date().toISOString(),
    })

    logger.info(`Recommendation created: ${created.id} — priority: ${priority}`)
    return { ok: true, recommendation_id: created.id }
  }

  if (name === 'create_alert') {
    const { type, severity, title, message, tower_id, cluster_id, action_required } = input as {
      type: string
      severity: string
      title: string
      message: string
      tower_id?: string
      cluster_id?: string
      action_required: boolean
    }

    const alert = await prisma.alerts.create({
      data: { type, severity, title, message, tower_id: tower_id ?? null, cluster_id: cluster_id ?? null, action_required },
      select: { id: true, created_at: true },
    })

    // Emit the alert live to the sidebar feed
    emitAlertNew({
      id: alert.id,
      type: type as AlertType,
      severity: severity as AlertSeverity,
      title,
      message,
      tower_id,
      cluster_id,
      read: false,
      action_required,
      created_at: (alert.created_at ?? new Date()).toISOString(),
    })

    logger.info(`Alert created — ${type} / ${severity}: ${title}`)
    return { ok: true }
  }

  throw new Error(`Unknown tool: ${name}`)
}

// ── Main export ───────────────────────────────────────────────────────────
export async function runPatternAgent(): Promise<void> {
  logger.info('Pattern agent started')

  const systemPrompt = `You are a telecom network intelligence agent.
Your job is to analyze complaint patterns and generate actionable recommendations.

Steps you MUST follow:
1. Call get_recent_complaints to fetch complaints and pre-computed clusters
2. For each cluster with 2+ complaints, call create_cluster to save it
3. For each saved cluster, call generate_recommendation with:
   - A specific root_cause (what is likely causing this issue)
   - A specific suggested_action (what the field team should do)
   - Realistic affected_users estimate
   - Appropriate priority (critical if tower failure/outage, high if widespread degradation)
4. Call create_alert for each cluster (type: new_cluster or recommendation_ready)

Be specific and actionable. Reference tower IDs and complaint counts in your reasoning.`

  const userMessage = 'Analyze recent complaint patterns, detect clusters, correlate to towers, and generate recommendations.'

  await runAgent(systemPrompt, userMessage, TOOLS, toolExecutor, 'pattern')

  logger.info('Pattern agent complete')
}
