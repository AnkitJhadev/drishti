import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { query } from '../db/postgres'
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

interface RecRow {
  id: string
  tower_id: string | null
  cluster_id: string | null
  root_cause: string
  suggested_action: string
  priority: string
}

async function toolExecutor(name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === 'update_tower_status') {
    const { tower_id, status } = input as { tower_id: string; status: TowerStatus }
    await query(`UPDATE towers SET status = $1, last_checked = NOW() WHERE id = $2`, [status, tower_id])
    emitTowerStatusChanged(tower_id, status)
    return { ok: true }
  }

  if (name === 'update_cluster_status') {
    const { cluster_id, status } = input as { cluster_id: string; status: string }
    await query(`UPDATE clusters SET status = $1, updated_at = NOW() WHERE id = $2`, [status, cluster_id])
    return { ok: true }
  }

  if (name === 'create_alert') {
    const { severity, title, message, tower_id } = input as {
      severity: string; title: string; message: string; tower_id?: string
    }
    const rows = await query<{ id: string; created_at: string }>(
      `INSERT INTO alerts (type, severity, title, message, tower_id, action_required)
       VALUES ('recommendation_ready', $1, $2, $3, $4, FALSE)
       RETURNING id, created_at`,
      [severity, title, message, tower_id ?? null]
    )
    emitAlertNew({
      id: rows[0].id,
      type: 'recommendation_ready' as AlertType,
      severity: severity as AlertSeverity,
      title,
      message,
      tower_id,
      read: false,
      action_required: false,
      created_at: rows[0].created_at,
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
  const recs = await query<RecRow>(
    `SELECT id, tower_id, cluster_id, root_cause, suggested_action, priority
     FROM recommendations WHERE id = $1`,
    [recommendationId]
  )
  if (recs.length === 0) return
  const rec = recs[0]

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

  await runAgent(systemPrompt, userMessage, TOOLS, toolExecutor)
  logger.info(`Approval agent completed follow-up for ${recommendationId} (${decision})`)
}
