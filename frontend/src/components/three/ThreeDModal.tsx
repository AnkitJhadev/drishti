import { lazy, Suspense } from 'react'
import ErrorBoundary from '../ErrorBoundary'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// Heavy (Three.js ~600KB) — lazy-loaded so it never touches initial load.
const TowerScene = lazy(() => import('./TowerScene'))

interface Props {
  open: boolean
  onClose: () => void
}

export default function ThreeDModal({ open, onClose }: Props) {
  useEscapeKey(open, onClose)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="dr-panel w-full max-w-5xl h-[82vh] flex flex-col dr-fade-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="3D network command view">
        <div className="dr-panel-header">
          <div className="flex items-center gap-2">
            <span style={{ color: '#10b981' }}>◈</span>
            <h2 className="dr-title">3D Network Command View</h2>
            <span className="text-xs" style={{ color: '#6b7280' }}>drag to orbit · scroll to zoom</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>
        <div className="flex-1 overflow-hidden rounded-b-lg">
          <ErrorBoundary compact area="3D view">
            <Suspense fallback={<div className="h-full flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>Loading 3D engine…</div>}>
              <TowerScene />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
