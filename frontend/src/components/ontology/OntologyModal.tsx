import { lazy, Suspense } from 'react'

const OntologyGraph = lazy(() => import('./OntologyGraph'))

interface Props {
  open: boolean
  onClose: () => void
}

export default function OntologyModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="dr-panel w-full max-w-5xl h-[80vh] flex flex-col dr-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="dr-panel-header">
          <div className="flex items-center gap-2">
            <span style={{ color: '#8b5cf6' }}>🕸</span>
            <h2 className="dr-title">Network Ontology — relationship graph</h2>
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-lg">
          <Suspense fallback={<div className="h-full flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>Loading graph…</div>}>
            <OntologyGraph />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
