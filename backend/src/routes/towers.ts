import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

// GET /towers — all towers with status
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `SELECT id, name, lat, lng, status, coverage_radius_km,
              active_complaints, affected_users, last_checked
       FROM towers
       ORDER BY
         CASE status
           WHEN 'critical'    THEN 1
           WHEN 'offline'     THEN 2
           WHEN 'degraded'    THEN 3
           WHEN 'operational' THEN 4
         END,
         active_complaints DESC`
    )
    res.json({ towers: rows })
  } catch (err) {
    logger.error(`GET /towers error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch towers' })
  }
})

// GET /towers/:id — tower detail + recent complaints + recommendations
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const towerRows = await query(
      `SELECT id, name, lat, lng, status, coverage_radius_km,
              active_complaints, affected_users, last_checked, metadata
       FROM towers WHERE id = $1`,
      [req.params.id]
    )

    if (towerRows.length === 0) {
      res.status(404).json({ error: 'Tower not found' })
      return
    }

    const [complaints, recommendations, clusters] = await Promise.all([
      query(
        `SELECT id, source, issue_type, severity, status, timestamp, location_hint
         FROM complaints WHERE tower_id = $1
         ORDER BY timestamp DESC LIMIT 20`,
        [req.params.id]
      ),
      query(
        `SELECT id, root_cause, suggested_action, priority, confidence, status, created_at
         FROM recommendations WHERE tower_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [req.params.id]
      ),
      query(
        `SELECT id FROM clusters WHERE tower_id = $1`,
        [req.params.id]
      ),
    ])

    res.json({
      tower: towerRows[0],
      complaints,
      recommendations,
      cluster_ids: (clusters as { id: string }[]).map((c) => c.id),
    })
  } catch (err) {
    logger.error(`GET /towers/:id error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch tower' })
  }
})

export default router
