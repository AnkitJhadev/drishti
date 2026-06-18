import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { prisma } from '../db/prisma'
import { runApprovalAgent } from '../agents/approvalAgent'
import { addPatternJob } from '../queue/jobs/patternJob'
import { emitTowerStatusChanged, emitAlertNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'

const router = Router()

const PRIORITY_RANK: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 }

// POST /recommendations/analyze — manually trigger a pattern-analysis pass
// (cluster recent complaints → correlate to towers → generate recommendations).
router.post('/analyze', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    await addPatternJob(0)
    res.status(202).json({ message: 'Pattern analysis queued' })
  } catch (err) {
    logger.error(`POST /recommendations/analyze error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to queue analysis' })
  }
})

// GET /recommendations — by status, worst-priority first
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = (req.query.status as string) ?? 'pending'

    const rows = await prisma.recommendations.findMany({
      where: { status },
      include: {
        towers: { select: { name: true } },
        clusters: { select: { issue_type: true, size: true } },
      },
    })

    const recommendations = rows
      .sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5) ||
          (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0)
      )
      .map(({ towers, clusters, ...r }) => ({
        ...r,
        tower_name: towers?.name ?? null,
        cluster_issue_type: clusters?.issue_type ?? null,
        cluster_size: clusters?.size ?? null,
      }))

    res.json({ recommendations })
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

    const updated = await prisma.recommendations.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: { status: 'approved', operator_note: note ?? null, reviewed_at: new Date(), reviewed_by: operator.email },
    })
    if (updated.count === 0) {
      res.status(404).json({ error: 'Recommendation not found or already reviewed' })
      return
    }

    const rec = await prisma.recommendations.findUnique({
      where: { id: req.params.id },
      select: { id: true, tower_id: true, cluster_id: true },
    })
    if (!rec) {
      res.json({ ok: true })
      return
    }

    // Resolution ticket
    await prisma.resolutions.create({
      data: { recommendation_id: rec.id, tower_id: rec.tower_id, cluster_id: rec.cluster_id, assigned_to: operator.email },
    })

    // Approval alert
    await prisma.alerts.create({
      data: {
        type: 'recommendation_ready',
        severity: 'info',
        title: 'Recommendation Approved',
        message: `Recommendation ${rec.id} approved by ${operator.email}`,
        tower_id: rec.tower_id,
        action_required: false,
      },
    })

    logger.info(`Recommendation ${rec.id} approved by ${operator.email}`)

    // Best-effort AI follow-up (Agent 4) — never blocks the response
    runApprovalAgent(rec.id, 'approved').catch((e) => logger.warn(`Approval agent skipped: ${String(e)}`))

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

    const updated = await prisma.recommendations.updateMany({
      where: { id: req.params.id, status: 'pending' },
      data: { status: 'rejected', operator_note: note ?? null, reviewed_at: new Date(), reviewed_by: operator.email },
    })
    if (updated.count === 0) {
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

    await prisma.alerts.create({
      data: {
        type: 'approval_pending',
        severity: 'critical',
        title: 'Recommendation Escalated',
        message: `Recommendation ${req.params.id} escalated by ${operator.email}. Note: ${note ?? 'none'}`,
        action_required: true,
      },
    })

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

    const rec = await prisma.recommendations.findUnique({
      where: { id: req.params.id },
      select: { id: true, tower_id: true, cluster_id: true },
    })
    if (!rec) {
      res.status(404).json({ error: 'Recommendation not found' })
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.resolutions.updateMany({
        where: { recommendation_id: rec.id },
        data: { status: 'resolved', resolved_at: new Date() },
      })
      if (rec.cluster_id) {
        await tx.clusters.updateMany({ where: { id: rec.cluster_id }, data: { status: 'resolved', updated_at: new Date() } })
        await tx.complaints.updateMany({ where: { cluster_id: rec.cluster_id }, data: { status: 'resolved' } })
      }
      if (rec.tower_id) {
        await tx.towers.updateMany({
          where: { id: rec.tower_id },
          data: { status: 'operational', active_complaints: 0, affected_users: 0, last_checked: new Date() },
        })
      }
    })

    // Live updates
    if (rec.tower_id) emitTowerStatusChanged(rec.tower_id, 'operational')
    const message = `Incident resolved by ${operator.email}. Tower restored to operational.`
    const alert = await prisma.alerts.create({
      data: {
        type: 'recommendation_ready',
        severity: 'info',
        title: 'Incident Resolved',
        message,
        tower_id: rec.tower_id,
        action_required: false,
      },
      select: { id: true, created_at: true },
    })
    emitAlertNew({
      id: alert.id,
      type: 'recommendation_ready',
      severity: 'info',
      title: 'Incident Resolved',
      message,
      tower_id: rec.tower_id ?? undefined,
      read: false,
      action_required: false,
      created_at: (alert.created_at ?? new Date()).toISOString(),
    })

    logger.info(`Recommendation ${rec.id} resolved by ${operator.email}`)
    res.json({ ok: true })
  } catch (err) {
    logger.error(`PATCH /recommendations/:id/resolve error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to resolve' })
  }
})

export default router
