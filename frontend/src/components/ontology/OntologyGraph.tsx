import { useEffect, useRef, useState } from 'react'
import {
  forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide,
  type Simulation,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom'
import api from '../../services/api'

interface RawNode { id: string; type: string; label: string; status?: string; severity?: string; priority?: string }
interface RawLink { source: string; target: string }
type SimNode = RawNode & { x: number; y: number; fx?: number | null; fy?: number | null }
type SimLink = { source: SimNode; target: SimNode }

const TYPE_COLOR: Record<string, string> = {
  tower: '#3b82f6', cluster: '#8b5cf6', complaint: '#9ca3af', recommendation: '#f59e0b',
}
const STATUS_COLOR: Record<string, string> = {
  operational: '#10b981', degraded: '#f97316', critical: '#ef4444', offline: '#6b7280',
}
const RADIUS: Record<string, number> = { tower: 12, cluster: 9, recommendation: 7, complaint: 5 }

function nodeColor(n: RawNode): string {
  if (n.type === 'tower' && n.status) return STATUS_COLOR[n.status] ?? TYPE_COLOR.tower
  return TYPE_COLOR[n.type] ?? '#9ca3af'
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

  // Fetch graph + run simulation
  useEffect(() => {
    let raf = 0
    let active = true
    api.get<{ nodes: RawNode[]; links: RawLink[] }>('/ontology').then(({ data }) => {
      if (!active) return
      const simNodes: SimNode[] = data.nodes.map((n) => ({ ...n, x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 200 }))
      const byId = new Map(simNodes.map((n) => [n.id, n]))
      const simLinks: SimLink[] = data.links
        .map((l) => ({ source: byId.get(l.source)!, target: byId.get(l.target)! }))
        .filter((l) => l.source && l.target)

      const sim = forceSimulation<SimNode>(simNodes)
        .force('charge', forceManyBody().strength(-180))
        .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(60).strength(0.6))
        .force('center', forceCenter(W / 2, H / 2))
        .force('collide', forceCollide<SimNode>().radius((d) => RADIUS[d.type] + 4))

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

  // Drag (account for zoom scale)
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

  return (
    <div className="relative h-full w-full" style={{ background: '#0a0f1e' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>
          Building ontology graph…
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
            <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke="#1f2937" strokeWidth={1} />
          ))}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}
              onPointerDown={(e) => { e.stopPropagation(); onDown(n) }}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}>
              <circle r={RADIUS[n.type]} fill={nodeColor(n)} stroke="#0a0f1e" strokeWidth={1.5}
                className={n.status === 'critical' ? 'dr-pulse-danger' : undefined} />
              {(n.type === 'tower' || hover?.id === n.id) && (
                <text x={RADIUS[n.type] + 3} y={3} fontSize={9} fill="#9ca3af">{n.label}</text>
              )}
            </g>
          ))}
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
      </div>
      <div className="dr-glass absolute top-2 right-2 px-2.5 py-1 rounded-lg text-xs" style={{ color: '#6b7280' }}>
        {nodes.length} nodes · drag to move · scroll to zoom
      </div>
    </div>
  )
}
