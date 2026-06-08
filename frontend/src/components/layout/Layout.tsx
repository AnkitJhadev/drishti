import { useState, type ReactNode } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const offline = useOfflineStatus()
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0a0f1e' }}>
      {offline && (
        <div className="text-center py-1 text-xs font-medium shrink-0" style={{ background: '#7c2d12', color: '#fb923c' }}>
          ⚠ You are offline — showing cached data. Live updates paused.
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
