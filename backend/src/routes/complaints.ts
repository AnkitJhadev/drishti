import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../db/prisma'
import { emitComplaintResolved, emitTowerStatusChanged } from '../websocket/wsServer'
import { logger } from '../utils/logger'

const router = Router()

// PATCH /complaints/:id/resolve — one-click resolve a single complaint.
// Marks it resolved and decrements its tower's active count; if that tower
// has no active complaints left, restores it to operational.
router.patch('/:id/resolve', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const complaint = await prisma.complaints.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, tower_id: true },
    })
    if (!complaint || complaint.status === 'resolved') {
      res.status(404).json({ error: 'Complaint not found or already resolved' })
      return
    }

    await prisma.complaints.update({ where: { id: complaint.id }, data: { status: 'resolved' } })

    const towerId = complaint.tower_id
    if (towerId) {
      const tw = await prisma.towers.update({
        where: { id: towerId },
        data: { active_complaints: { decrement: 1 } },
        select: { active_complaints: true },
      })
      let count = tw.active_complaints ?? 0
      if (count < 0) {
        await prisma.towers.update({ where: { id: towerId }, data: { active_complaints: 0 } })
        count = 0
      }
      // No active complaints left → tower back to operational
      if (count === 0) {
        await prisma.towers.update({ where: { id: towerId }, data: { status: 'operational' } })
        emitTowerStatusChanged(towerId, 'operational')
      }
    }

    emitComplaintResolved(complaint.id)
    logger.info(`Complaint ${complaint.id} resolved`)
    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /complaints/:id/resolve error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to resolve complaint' })
  }
})

// GET /complaints — paginated list with filters
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20)
    const offset = (page - 1) * limit

    const where: { status?: string; source?: string; severity?: string } = {}
    if (req.query.status) where.status = req.query.status as string
    if (req.query.source) where.source = req.query.source as string
    if (req.query.severity) where.severity = req.query.severity as string

    const [rows, total] = await Promise.all([
      prisma.complaints.findMany({ where, orderBy: { timestamp: 'desc' }, skip: offset, take: limit }),
      prisma.complaints.count({ where }),
    ])

    // Map lat/lng → coordinates tuple, and lift the failure reason out of
    // metadata so a reloaded page still shows why a complaint wasn't classified.
    const complaints = rows.map((r) => ({
      ...r,
      coordinates: [r.lat ?? 0, r.lng ?? 0],
      error: (r.metadata as { error?: string } | null)?.error,
    }))

    res.json({
      complaints,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    logger.error(`GET /complaints error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch complaints' })
  }
})

// GET /complaints/:id — single complaint detail (+ correlated tower name/status)
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const c = await prisma.complaints.findUnique({
      where: { id: req.params.id },
      include: { towers: { select: { name: true, status: true } } },
    })

    if (!c) {
      res.status(404).json({ error: 'Complaint not found' })
      return
    }

    const { towers, ...rest } = c
    res.json({ complaint: { ...rest, tower_name: towers?.name ?? null, tower_status: towers?.status ?? null } })
  } catch (err) {
    logger.error(`GET /complaints/:id error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch complaint' })
  }
})

export default router
