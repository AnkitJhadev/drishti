import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
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

export default router
