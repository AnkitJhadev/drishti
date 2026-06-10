import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

type NodeType = 'tower' | 'cluster' | 'recommendation'

interface GraphNode {
  id: string
  type: NodeType
  label: string
  status?: string
  priority?: string
  weight?: number // tower: active complaints · cluster: complaint count — drives node size
}
interface GraphLink {
  source: string
  target: string
}

// GET /ontology — aggregated incident graph: Tower ◀ Cluster ◀ Recommendation.
// Individual complaints are summarised into cluster size (weight) rather than
// drawn as dozens of dots, so the structure (which tower owns which incident,
// and whether it has a recommendation) reads at a glance. Powers the D3 viewer.
router.get('/', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [towers, clusters, recs] = await Promise.all([
      query<{ id: string; name: string; status: string; active_complaints: number }>(
        `SELECT id, name, status, active_complaints FROM towers`
      ),
      query<{ id: string; issue_type: string; tower_id: string | null; size: number }>(
        `SELECT id, issue_type, tower_id, size FROM clusters`
      ),
      query<{ id: string; cluster_id: string | null; tower_id: string | null; priority: string }>(
        `SELECT id, cluster_id, tower_id, priority FROM recommendations`
      ),
    ])

    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const seen = new Set<string>()
    const add = (n: GraphNode) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n) } }

    // Only include towers that actually participate (referenced or non-operational)
    const refTowers = new Set<string>()
    clusters.forEach((c) => c.tower_id && refTowers.add(c.tower_id))
    recs.forEach((r) => r.tower_id && refTowers.add(r.tower_id))

    towers.filter((t) => refTowers.has(t.id) || t.status !== 'operational').forEach((t) =>
      add({ id: `tower:${t.id}`, type: 'tower', label: t.id, status: t.status, weight: t.active_complaints })
    )
    clusters.forEach((c) => {
      add({ id: `cluster:${c.id}`, type: 'cluster', label: c.issue_type, weight: c.size })
      if (c.tower_id && seen.has(`tower:${c.tower_id}`)) links.push({ source: `cluster:${c.id}`, target: `tower:${c.tower_id}` })
    })
    recs.forEach((r) => {
      add({ id: `rec:${r.id}`, type: 'recommendation', label: r.priority, priority: r.priority })
      if (r.cluster_id && seen.has(`cluster:${r.cluster_id}`)) links.push({ source: `rec:${r.id}`, target: `cluster:${r.cluster_id}` })
      else if (r.tower_id && seen.has(`tower:${r.tower_id}`)) links.push({ source: `rec:${r.id}`, target: `tower:${r.tower_id}` })
    })

    // Drop orphan nodes (no edges) — keep only the connected incident structure,
    // plus any non-operational tower (an incident even if not yet linked).
    const linked = new Set<string>()
    links.forEach((l) => { linked.add(l.source); linked.add(l.target) })
    const finalNodes = nodes.filter(
      (n) => linked.has(n.id) || (n.type === 'tower' && n.status !== 'operational')
    )
    const keep = new Set(finalNodes.map((n) => n.id))
    const finalLinks = links.filter((l) => keep.has(l.source) && keep.has(l.target))

    res.json({ nodes: finalNodes, links: finalLinks })
  } catch (err) {
    logger.error(`GET /ontology error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to build ontology graph' })
  }
})

export default router
