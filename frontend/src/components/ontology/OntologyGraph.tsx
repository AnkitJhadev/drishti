import { useEffect, useRef, useState } from 'react'
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
  type Simulation,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom'
import api from '../../services/api'

interface RawNode { id: string; type: string; label: string; status?: string; priority?: string; weight?: number }
interface RawLink { source: string; target: string }
type SimNode = RawNode & { x: number; y: number; fx?: number | null; fy?: number | null }
type SimLink = { source: SimNode; target: SimNode }

const TYPE_COLOR: Record<string, string> = {
  tower: '#3b82f6', cluster: '#8b5cf6', recommendation: '#f59e0b',
}
const STATUS_COLOR: Record<string, string> = {
  operational: '#10b981', degraded: '#f97316', critical: '#ef4444', offline: '#6b7280',
}

function nodeColor(n: RawNode): string {
  if (n.type === 'tower' && n.status) return STATUS_COLOR[n.status] ?? TYPE_COLOR.tower
  return TYPE_COLOR[n.type] ?? '#9ca3af'
}

// Node radius scales with importance: tower → active complaints, cluster → size.
function radiusOf(n: RawNode): number {
  const w = n.weight ?? 0
  if (n.type === 'tower') return Math.min(26, 11 + Math.sqrt(w) * 1.7)
  if (n.type === 'cluster') return Math.min(22, 8 + Math.sqrt(w) * 2.0)
  return 7 // recommendation
}

const W = 900, H = 560

export default function OntologyGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [links, setLinks] = useState<SimLink[]>([])
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)
  const [hover, setHover] = useState<SimNode | null>(null)
  const [loading, setLoading] = useState(true)
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null)
  const dragRef = useRef<{ node: SimNode } | null>(null)

  useEffect(() => {
    let raf = 0
    let active = true
    api.get<{ nodes: RawNode[]; links: RawLink[] }>('/ontology').then(({ data }) => {
      if (!active) return
      const simNodes: SimNode[] = data.nodes.map((n) => ({ ...n, x: W / 2 + (Math.random() - 0.5) * 240, y: H / 2 + (Math.random() - 0.5) * 240 }))
      const byId = new Map(simNodes.map((n) => [n.id, n]))
      const simLinks: SimLink[] = data.links
        .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)! }))
        .filter((l) => l.source && l.target)

      const sim = forceSimulation<SimNode>(simNodes)
        .force('charge', forceManyBody().strength(-420))
        .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(90).strength(0.7))
        .force('center', forceCenter(W / 2, H / 2))
        .force('collide', forceCollide<SimNode>().radius((d) => radiusOf(d) + 8))

      simRef.current = sim
      setNodes(simNodes)
      setLinks(simLinks)
      setLoading(false)

      const tick = () => {
        setNodes([...simNodes])
        setLinks([...simLinks])
        if (sim.alpha() > 0.02) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }).catch(() => active && setLoading(false))

    return () => { active = false; cancelAnimationFrame(raf); simRef.current?.stop() }
  }, [])

  // Zoom / pan
  useEffect(() => {
    if (!svgRef.current) return
    const sel = select(svgRef.current)
    const z = d3zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on('zoom', (e) => setTransform(e.transform))
    sel.call(z)
    return () => { sel.on('.zoom', null) }
  }, [])

  function onDown(n: SimNode) { dragRef.current = { node: n }; simRef.current?.alphaTarget(0.3).restart() }
  function onMove(e: React.PointerEvent) {
    if (!dragRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left - transform.x) / transform.k
    const y = (e.clientY - rect.top - transform.y) / transform.k
    dragRef.current.node.fx = x; dragRef.current.node.fy = y
  }
  function onUp() {
    if (dragRef.current) { dragRef.current.node.fx = null; dragRef.current.node.fy = null }
    dragRef.current = null
    simRef.current?.alphaTarget(0)
  }

  // Hover-to-focus: highlight the hovered node + its direct neighbours, dim the rest.
  const focusId = hover?.id ?? null
  const neighborIds = focusId
    ? new Set<string>([
        focusId,
        ...links.filter((l) => l.source.id === focusId || l.target.id === focusId)
          .flatMap((l) => [l.source.id, l.target.id]),
      ])
    : null
  const nodeOpacity = (n: SimNode) => (!neighborIds ? 1 : neighborIds.has(n.id) ? 1 : 0.12)
  const linkActive = (l: SimLink) => focusId != null && (l.source.id === focusId || l.target.id === focusId)

  return (
    <div className="relative h-full w-full" style={{ background: '#0a0f1e' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>
          Building ontology graph…
        </div>
      )}
      {!loading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-center px-6" style={{ color: '#6b7280' }}>
          No incidents yet — ingest complaints and run analysis to populate the graph.
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
        onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {links.map((l, i) => (
            <line
              key={i}
              x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
              stroke={linkActive(l) ? '#f59e0b' : '#475569'}
              strokeWidth={linkActive(l) ? 2 : 1.25}
              strokeOpacity={!focusId ? 0.55 : linkActive(l) ? 0.95 : 0.08}
            />
          ))}
          {nodes.map((n) => {
            const r = radiusOf(n)
            const showLabel = n.type === 'tower' || n.type === 'cluster' || hover?.id === n.id
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                opacity={nodeOpacity(n)}
                onPointerDown={(e) => { e.stopPropagation(); onDown(n) }}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}>
                <circle r={r} fill={nodeColor(n)} stroke="#0a0f1e" strokeWidth={1.5}
                  className={n.status === 'critical' ? 'dr-pulse-danger' : undefined} />
                {showLabel && (
                  <text x={r + 4} y={3} fontSize={10} fill="#cbd5e1" style={{ pointerEvents: 'none' }}>
                    {n.label}{(n.type === 'cluster' || n.type === 'tower') && n.weight ? ` · ${n.weight}` : ''}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="dr-glass absolute bottom-2 left-2 px-3 py-2 rounded-lg text-xs space-y-1">
        {Object.entries(TYPE_COLOR).map(([type, color]) => (
          <div key={type} className="flex items-center gap-2" style={{ color: '#9ca3af' }}>
            <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: color }} />
            <span className="capitalize">{type}</span>
          </div>
        ))}
        <div className="pt-1 mt-1" style={{ borderTop: '1px solid #1f2937', color: '#6b7280' }}>
          size = complaint volume · hover to trace
        </div>
      </div>
      <div className="dr-glass absolute top-2 right-2 px-2.5 py-1 rounded-lg text-xs" style={{ color: '#6b7280' }}>
        {nodes.length} nodes · drag · scroll to zoom
      </div>
    </div>
  )
}
