import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

// GET /alerts — paginated alerts, unread first
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, parseInt(req.query.limit as string) || 30)
    const unreadOnly = req.query.unread === 'true'

    const where = unreadOnly ? 'WHERE read = FALSE' : ''

    const rows = await query(
      `SELECT id, type, severity, title, message, tower_id, cluster_id,
              read, action_required, created_at
       FROM alerts ${where}
       ORDER BY read ASC, created_at DESC
       LIMIT $1`,
      [limit]
    )

    const unreadCount = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM alerts WHERE read = FALSE`
    )

    res.json({
      alerts: rows,
      unread_count: parseInt(unreadCount[0].count, 10),
    })
  } catch (err) {
    logger.error(`GET /alerts error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// PATCH /alerts/:id/read — mark as read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `UPDATE alerts SET read = TRUE WHERE id = $1 RETURNING id`,
      [req.params.id]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Alert not found' })
      return
    }

    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /alerts/:id/read error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to update alert' })
  }
})

export default router
