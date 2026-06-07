import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

type NodeType = 'tower' | 'cluster' | 'complaint' | 'recommendation'

interface GraphNode {
  id: string
  type: NodeType
  label: string
  status?: string
  severity?: string
  priority?: string
}
interface GraphLink {
  source: string
  target: string
}

// GET /ontology — relationship graph: complaint → cluster → tower, plus
// recommendations. Powers the D3 ontology viewer.
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [towers, clusters, complaints, recs] = await Promise.all([
      query<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM towers`
      ),
      query<{ id: string; issue_type: string; tower_id: string | null; size: number }>(
        `SELECT id, issue_type, tower_id, size FROM clusters`
      ),
      query<{ id: string; issue_type: string | null; severity: string | null; cluster_id: string | null; tower_id: string | null }>(
        `SELECT id, issue_type, severity, cluster_id, tower_id
         FROM complaints ORDER BY timestamp DESC LIMIT 80`
      ),
      query<{ id: string; cluster_id: string | null; tower_id: string | null; priority: string }>(
        `SELECT id, cluster_id, tower_id, priority FROM recommendations`
      ),
    ])

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const seen = new Set<string>()
    const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n) } }

    // Only include towers that actually participate (affected or referenced)
    const refTowers = new Set<string>()
    clusters.forEach((c) => c.tower_id && refTowers.add(c.tower_id))
    complaints.forEach((c) => c.tower_id && refTowers.add(c.tower_id))
    recs.forEach((r) => r.tower_id && refTowers.add(r.tower_id))

    towers.filter((t) => refTowers.has(t.id) || t.status !== 'operational').forEach((t) =>
      add({ id: `tower:${t.id}`, type: 'tower', label: t.id, status: t.status })
    )
    clusters.forEach((c) => {
      add({ id: `cluster:${c.id}`, type: 'cluster', label: c.issue_type })
      if (c.tower_id && seen.has(`tower:${c.tower_id}`)) links.push({ source: `cluster:${c.id}`, target: `tower:${c.tower_id}` })
    })
    complaints.forEach((c) => {
      add({ id: `complaint:${c.id}`, type: 'complaint', label: c.issue_type ?? 'unknown', severity: c.severity ?? undefined })
      if (c.cluster_id && seen.has(`cluster:${c.cluster_id}`)) {
        links.push({ source: `complaint:${c.id}`, target: `cluster:${c.cluster_id}` })
      } else if (c.tower_id && seen.has(`tower:${c.tower_id}`)) {
        links.push({ source: `complaint:${c.id}`, target: `tower:${c.tower_id}` })
      }
    })
    recs.forEach((r) => {
      add({ id: `rec:${r.id}`, type: 'recommendation', label: r.priority, priority: r.priority })
      if (r.cluster_id && seen.has(`cluster:${r.cluster_id}`)) links.push({ source: `rec:${r.id}`, target: `cluster:${r.cluster_id}` })
      else if (r.tower_id && seen.has(`tower:${r.tower_id}`)) links.push({ source: `rec:${r.id}`, target: `tower:${r.tower_id}` })
    })

    res.json({ nodes, links })
  } catch (err) {
    logger.error(`GET /ontology error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to build ontology graph' })
  }
})

export default router
