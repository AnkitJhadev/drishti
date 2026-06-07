import type { ReactNode } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const offline = useOfflineStatus()

  return (
    <div className="h-screen flex flex-col" style={{ background: '#0a0f1e' }}>
      {offline && (
        <div className="text-center py-1 text-xs font-medium shrink-0" style={{ background: '#7c2d12', color: '#fb923c' }}>
          ⚠ You are offline — showing cached data. Live updates paused.
        </div>
      )}
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
