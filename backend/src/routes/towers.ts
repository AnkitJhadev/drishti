import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { createTowerSchema, type CreateTowerBody } from '../schemas/tower.schema'
import { prisma } from '../db/prisma'
import { emitTowerAdded } from '../websocket/wsServer'
import { logger } from '../utils/logger'

const router = Router()

// Worst-status-first ordering (Prisma can't express a CASE in orderBy).
const STATUS_RANK: Record<string, number> = { critical: 1, offline: 2, degraded: 3, operational: 4 }

// Generate the next sequential tower id: T-101, T-102, …
async function nextTowerId(): Promise<string> {
  const rows = await prisma.towers.findMany({ select: { id: true } })
  const max = rows.reduce(
    (m, r) => (/^T-\d+$/.test(r.id) ? Math.max(m, parseInt(r.id.slice(2), 10) || 0) : m),
    100
  )
  return `T-${max + 1}`
}

// POST /towers — manually add a new tower (e.g. company opens a new site)
router.post('/', requireAuth, validateBody(createTowerSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lat, lng, coverage_radius_km } = req.body as CreateTowerBody
    const id = await nextTowerId()

    const created = await prisma.towers.create({
      data: {
        id,
        name: name.trim(),
        lat,
        lng,
        status: 'operational',
        coverage_radius_km: coverage_radius_km ?? 2.0,
        active_complaints: 0,
        affected_users: 0,
      },
    })

    const tower = { ...created, coordinates: [created.lat, created.lng] as [number, number] }
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
    const rows = await prisma.towers.findMany()
    rows.sort(
      (a, b) =>
        (STATUS_RANK[a.status ?? 'operational'] ?? 5) - (STATUS_RANK[b.status ?? 'operational'] ?? 5) ||
        (b.active_complaints ?? 0) - (a.active_complaints ?? 0)
    )
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
    const tower = await prisma.towers.findUnique({ where: { id: req.params.id } })
    if (!tower) {
      res.status(404).json({ error: 'Tower not found' })
      return
    }

    const [complaints, recommendations, clusters] = await Promise.all([
      prisma.complaints.findMany({
        where: { tower_id: req.params.id },
        select: { id: true, source: true, issue_type: true, severity: true, status: true, timestamp: true, location_hint: true },
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
      prisma.recommendations.findMany({
        where: { tower_id: req.params.id },
        select: { id: true, root_cause: true, suggested_action: true, priority: true, confidence: true, status: true, created_at: true },
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
      prisma.clusters.findMany({ where: { tower_id: req.params.id }, select: { id: true } }),
    ])

    res.json({ tower, complaints, recommendations, cluster_ids: clusters.map((c) => c.id) })
  } catch (err) {
    logger.error(`GET /towers/:id error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch tower' })
  }
})

export default router
