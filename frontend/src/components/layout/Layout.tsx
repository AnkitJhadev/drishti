import { useState, type ReactNode } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { useActionQueueStore } from '../../stores/actionQueueStore'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const offline = useOfflineStatus()
  const queued = useActionQueueStore((s) => s.queue.length)
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0a0f1e' }}>
      {offline && (
        <div className="text-center py-1 text-xs font-medium shrink-0" style={{ background: '#7c2d12', color: '#fb923c' }}>
          ⚠ You are offline — showing cached data. Live updates paused.
          {queued > 0 && ` ${queued} action${queued > 1 ? 's' : ''} queued — will sync on reconnect.`}
        </div>
      )}
      {!offline && queued > 0 && (
        <div className="text-center py-1 text-xs font-medium shrink-0" style={{ background: '#0c2a4a', color: '#93c5fd' }}>
          <span className="dr-spinner" style={{ width: 9, height: 9 }} /> Syncing {queued} queued action{queued > 1 ? 's' : ''}…
        </div>
      )}
      <TopBar onMenuClick={() => setNavOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={navOpen} onMobileClose={() => setNavOpen(false)} />
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
