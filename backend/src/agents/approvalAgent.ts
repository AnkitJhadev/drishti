import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { prisma } from '../db/prisma'
import { emitAlertNew, emitTowerStatusChanged } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { TowerStatus } from '../types/tower'
import type { AlertType, AlertSeverity } from '../types/alert'

// ── Tool definitions (Agent 4) ────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_tower_status',
    description: 'Update a tower status after an operator decision',
    input_schema: {
      type: 'object' as const,
      properties: {
        tower_id: { type: 'string' },
        status: { type: 'string', enum: ['operational', 'degraded', 'critical', 'offline'] },
      },
      required: ['tower_id', 'status'],
    },
  },
  {
    name: 'update_cluster_status',
    description: 'Update a complaint cluster status (open | actioned | resolved)',
    input_schema: {
      type: 'object' as const,
      properties: {
        cluster_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'actioned', 'resolved'] },
      },
      required: ['cluster_id', 'status'],
    },
  },
  {
    name: 'create_alert',
    description: 'Create an alert summarizing the decision and next steps',
    input_schema: {
      type: 'object' as const,
      properties: {
        severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
        title: { type: 'string' },
        message: { type: 'string' },
        tower_id: { type: 'string' },
      },
      required: ['severity', 'title', 'message'],
    },
  },
]

async function toolExecutor(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'update_tower_status') {
    const { tower_id, status } = input as { tower_id: string; status: TowerStatus }
    await prisma.towers.updateMany({ where: { id: tower_id }, data: { status, last_checked: new Date() } })
    emitTowerStatusChanged(tower_id, status)
    return { ok: true }
  }

  if (name === 'update_cluster_status') {
    const { cluster_id, status } = input as { cluster_id: string; status: string }
    await prisma.clusters.updateMany({ where: { id: cluster_id }, data: { status, updated_at: new Date() } })
    return { ok: true }
  }

  if (name === 'create_alert') {
    const { severity, title, message, tower_id } = input as {
      severity: string; title: string; message: string; tower_id?: string
    }
    const created = await prisma.alerts.create({
      data: { type: 'recommendation_ready', severity, title, message, tower_id: tower_id ?? null, action_required: false },
      select: { id: true, created_at: true },
    })
    emitAlertNew({
      id: created.id,
      type: 'recommendation_ready' as AlertType,
      severity: severity as AlertSeverity,
      title,
      message,
      tower_id,
      read: false,
      action_required: false,
      created_at: (created.created_at ?? new Date()).toISOString(),
    })
    return { ok: true }
  }

  throw new Error(`Unknown tool: ${name}`)
}

// ── Best-effort enrichment: ask Claude to plan the resolution ─────────────
// Called AFTER the deterministic route logic has already applied the decision.
// Wrapped in try/catch by the caller so missing credits never block approval.
export async function runApprovalAgent(
  recommendationId: string,
  decision: 'approved' | 'rejected' | 'escalated'
): Promise<void> {
  const rec = await prisma.recommendations.findUnique({
    where: { id: recommendationId },
    select: { id: true, tower_id: true, cluster_id: true, root_cause: true, suggested_action: true, priority: true },
  })
  if (!rec) return

  const systemPrompt = `You are the resolution coordinator for a telecom operations platform.
An operator has just ${decision} a recommendation. Execute the appropriate follow-up:
- If approved: mark the cluster as 'actioned' and create an informational alert with concrete next steps for the field team.
- If rejected: mark the cluster as 'open' again and create an alert noting the rejection.
- If escalated: create a critical alert for admin attention.
Use the provided tools. Be specific and reference the tower ID.`

  const userMessage = `Decision: ${decision}
Recommendation ID: ${rec.id}
Tower: ${rec.tower_id ?? 'none'}
Cluster: ${rec.cluster_id ?? 'none'}
Root cause: ${rec.root_cause}
Suggested action: ${rec.suggested_action}
Priority: ${rec.priority}`

  await runAgent(systemPrompt, userMessage, TOOLS, toolExecutor, 'approval')
  logger.info(`Approval agent completed follow-up for ${recommendationId} (${decision})`)
}
