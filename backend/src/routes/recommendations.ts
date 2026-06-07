import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query, withTransaction } from '../db/postgres'
import { runApprovalAgent } from '../agents/approvalAgent'
import { emitTowerStatusChanged, emitAlertNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'

const router = Router()

// GET /recommendations — pending recommendations
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = (req.query.status as string) ?? 'pending'

    const rows = await query(
      `SELECT r.id, r.cluster_id, r.tower_id, r.root_cause, r.suggested_action,
              r.affected_users, r.priority, r.confidence, r.status,
              r.operator_note, r.created_at, r.reviewed_at, r.reviewed_by,
              t.name as tower_name,
              cl.issue_type as cluster_issue_type, cl.size as cluster_size
       FROM recommendations r
       LEFT JOIN towers t ON r.tower_id = t.id
       LEFT JOIN clusters cl ON r.cluster_id = cl.id
       WHERE r.status = $1
       ORDER BY
         CASE r.priority
           WHEN 'critical' THEN 1
           WHEN 'high'     THEN 2
           WHEN 'medium'   THEN 3
           WHEN 'low'      THEN 4
         END,
         r.created_at DESC`,
      [status]
    )

    res.json({ recommendations: rows })
  } catch (err) {
    logger.error(`GET /recommendations error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch recommendations' })
  }
})

// PATCH /recommendations/:id/approve
router.patch('/:id/approve', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { note } = req.body as { note?: string }
    const operator = req.operator!

    const rows = await query<{ id: string; tower_id: string; cluster_id: string }>(
      `UPDATE recommendations
       SET status = 'approved', operator_note = $1,
           reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING id, tower_id, cluster_id`,
      [note ?? null, operator.email, req.params.id]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Recommendation not found or already reviewed' })
      return
    }

    const rec = rows[0]

    // Create resolution ticket
    await query(
      `INSERT INTO resolutions (recommendation_id, tower_id, cluster_id, assigned_to)
       VALUES ($1, $2, $3, $4)`,
      [rec.id, rec.tower_id ?? null, rec.cluster_id ?? null, operator.email]
    )

    // Create approval alert
    await query(
      `INSERT INTO alerts (type, severity, title, message, tower_id, action_required)
       VALUES ('recommendation_ready', 'info', 'Recommendation Approved',
               $1, $2, FALSE)`,
      [`Recommendation ${rec.id} approved by ${operator.email}`, rec.tower_id ?? null]
    )

    logger.info(`Recommendation ${rec.id} approved by ${operator.email}`)

    // Best-effort AI follow-up (Agent 4) — never blocks the response
    runApprovalAgent(rec.id, 'approved').catch((e) =>
      logger.warn(`Approval agent skipped: ${String(e)}`)
    )

    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /recommendations/:id/approve error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to approve recommendation' })
  }
})

// PATCH /recommendations/:id/reject
router.patch('/:id/reject', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { note } = req.body as { note?: string }
    const operator = req.operator!

    const rows = await query(
      `UPDATE recommendations
       SET status = 'rejected', operator_note = $1,
           reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3 AND status = 'pending'
       RETURNING id`,
      [note ?? null, operator.email, req.params.id]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Recommendation not found or already reviewed' })
      return
    }

    logger.info(`Recommendation ${req.params.id} rejected by ${operator.email}`)
    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /recommendations/:id/reject error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to reject recommendation' })
  }
})

// PATCH /recommendations/:id/escalate
router.patch('/:id/escalate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { note } = req.body as { note?: string }
    const operator = req.operator!

    await query(
      `INSERT INTO alerts (type, severity, title, message, action_required)
       VALUES ('approval_pending', 'critical', 'Recommendation Escalated',
               $1, TRUE)`,
      [`Recommendation ${req.params.id} escalated by ${operator.email}. Note: ${note ?? 'none'}`]
    )

    logger.info(`Recommendation ${req.params.id} escalated by ${operator.email}`)
    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /recommendations/:id/escalate error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to escalate recommendation' })
  }
})

// PATCH /recommendations/:id/resolve — close the loop: resolve cluster,
// mark its complaints resolved, restore the tower to operational.
router.patch('/:id/resolve', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const operator = req.operator!

    const recs = await query<{ id: string; tower_id: string | null; cluster_id: string | null }>(
      `SELECT id, tower_id, cluster_id FROM recommendations WHERE id = $1`,
      [req.params.id]
    )
    if (recs.length === 0) {
      res.status(404).json({ error: 'Recommendation not found' })
      return
    }
    const rec = recs[0]

    await withTransaction(async (client) => {
      // Resolution ticket → resolved
      await client.query(
        `UPDATE resolutions SET status = 'resolved', resolved_at = NOW()
         WHERE recommendation_id = $1`,
        [rec.id]
      )
      // Cluster → resolved + its complaints → resolved
      if (rec.cluster_id) {
        await client.query(`UPDATE clusters SET status = 'resolved', updated_at = NOW() WHERE id = $1`, [rec.cluster_id])
        await client.query(`UPDATE complaints SET status = 'resolved' WHERE cluster_id = $1`, [rec.cluster_id])
      }
      // Tower → operational, counters reset
      if (rec.tower_id) {
        await client.query(
          `UPDATE towers SET status = 'operational', active_complaints = 0,
           affected_users = 0, last_checked = NOW() WHERE id = $1`,
          [rec.tower_id]
        )
      }
    })

    // Live updates
    if (rec.tower_id) emitTowerStatusChanged(rec.tower_id, 'operational')
    const alertRows = await query<{ id: string; created_at: string }>(
      `INSERT INTO alerts (type, severity, title, message, tower_id, action_required)
       VALUES ('recommendation_ready', 'info', 'Incident Resolved', $1, $2, FALSE)
       RETURNING id, created_at`,
      [`Incident resolved by ${operator.email}. Tower restored to operational.`, rec.tower_id ?? null]
    )
    emitAlertNew({
      id: alertRows[0].id,
      type: 'recommendation_ready',
      severity: 'info',
      title: 'Incident Resolved',
      message: `Incident resolved by ${operator.email}. Tower restored to operational.`,
      tower_id: rec.tower_id ?? undefined,
      read: false,
      action_required: false,
      created_at: alertRows[0].created_at,
    })

    logger.info(`Recommendation ${rec.id} resolved by ${operator.email}`)
    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /recommendations/:id/resolve error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to resolve' })
  }
})

export default router
