import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

// GET /complaints — paginated list with filters
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const page    = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit   = Math.min(100, parseInt(req.query.limit as string) || 20)
    const offset  = (page - 1) * limit
    const status  = req.query.status as string | undefined
    const source  = req.query.source as string | undefined
    const severity = req.query.severity as string | undefined

    const conditions: string[] = []
    const params: unknown[] = []
    let p = 1

    if (status)   { conditions.push(`status = $${p++}`);   params.push(status) }
    if (source)   { conditions.push(`source = $${p++}`);   params.push(source) }
    if (severity) { conditions.push(`severity = $${p++}`); params.push(severity) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [rows, countRows] = await Promise.all([
      query<{ lat: number; lng: number }>(
        `SELECT id, source, raw_text, location_hint, lat, lng, sender,
                timestamp, status, issue_type, severity, confidence,
                cluster_id, tower_id, media_url
         FROM complaints ${where}
         ORDER BY timestamp DESC
         LIMIT $${p} OFFSET $${p + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM complaints ${where}`,
        params
      ),
    ])

    // Map lat/lng → coordinates tuple to match the frontend type
    const complaints = rows.map((r) => ({
      ...r,
      coordinates: [r.lat ?? 0, r.lng ?? 0],
    }))

    res.json({
      complaints,
      pagination: {
        page,
        limit,
        total: parseInt(countRows[0].count, 10),
        pages: Math.ceil(parseInt(countRows[0].count, 10) / limit),
      },
    })
  } catch (err) {
    logger.error(`GET /complaints error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch complaints' })
  }
})

// GET /complaints/:id — single complaint detail
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query(
      `SELECT c.*, t.name as tower_name, t.status as tower_status
       FROM complaints c
       LEFT JOIN towers t ON c.tower_id = t.id
       WHERE c.id = $1`,
      [req.params.id]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Complaint not found' })
      return
    }

    res.json({ complaint: rows[0] })
  } catch (err) {
    logger.error(`GET /complaints/:id error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch complaint' })
  }
})

export default router
