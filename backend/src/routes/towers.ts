import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { emitTowerAdded } from '../websocket/wsServer'
import { logger } from '../utils/logger'

const router = Router()

// Generate the next sequential tower id: T-101, T-102, …
async function nextTowerId(): Promise<string> {
  const rows = await query<{ id: string }>(`SELECT id FROM towers WHERE id ~ '^T-[0-9]+$'`)
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.id.slice(2), 10) || 0), 100)
  return `T-${max + 1}`
}

// POST /towers — manually add a new tower (e.g. company opens a new site)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lat, lng, coverage_radius_km } = req.body as {
      name?: string
      lat?: number
      lng?: number
      coverage_radius_km?: number
    }

    // ── Validate ──────────────────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Tower name is required' })
      return
    }
    if (typeof lat !== 'number' || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Valid latitude (-90 to 90) is required' })
      return
    }
    if (typeof lng !== 'number' || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Valid longitude (-180 to 180) is required' })
      return
    }
    const radius =
      typeof coverage_radius_km === 'number' && coverage_radius_km > 0
        ? Math.min(coverage_radius_km, 50)
        : 2.0

    const id = await nextTowerId()

    const rows = await query<{
      id: string
      name: string
      lat: number
      lng: number
      status: string
      coverage_radius_km: number
      active_complaints: number
      affected_users: number
      last_checked: string
    }>(
      `INSERT INTO towers
         (id, name, lat, lng, status, coverage_radius_km, active_complaints, affected_users)
       VALUES ($1, $2, $3, $4, 'operational', $5, 0, 0)
       RETURNING id, name, lat, lng, status, coverage_radius_km,
                 active_complaints, affected_users, last_checked`,
      [id, name.trim(), lat, lng, radius]
    )

    const tower = { ...rows[0], coordinates: [rows[0].lat, rows[0].lng] as [number, number] }
    emitTowerAdded(tower)
    logger.info(`Tower added: ${id} "${name}" @ ${lat},${lng}`)

    res.status(201).json({ tower })
  } catch (err) {
    logger.error(`POST /towers error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to add tower' })
  }
})

// GET /towers — all towers with status
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<{ lat: number; lng: number }>(
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
    // Map lat/lng → coordinates tuple to match the frontend Tower type
    const towers = rows.map((r) => ({ ...r, coordinates: [r.lat, r.lng] }))
    res.json({ towers })
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
