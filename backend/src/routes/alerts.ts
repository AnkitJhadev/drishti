import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../db/prisma'
import { logger } from '../utils/logger'

const router = Router()

// GET /alerts — paginated alerts, unread first
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string) || 30)
    const unreadOnly = req.query.unread === 'true'

    const [alerts, unread_count] = await Promise.all([
      prisma.alerts.findMany({
        where: unreadOnly ? { read: false } : {},
        orderBy: [{ read: 'asc' }, { created_at: 'desc' }],
        take: limit,
      }),
      prisma.alerts.count({ where: { read: false } }),
    ])

    res.json({ alerts, unread_count })
  } catch (err) {
    logger.error(`GET /alerts error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to fetch alerts' })
  }
})

// PATCH /alerts/:id/read — mark as read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await prisma.alerts.updateMany({ where: { id: req.params.id }, data: { read: true } })
    if (result.count === 0) {
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
