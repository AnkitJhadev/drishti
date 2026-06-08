import { useAuthStore } from '../../stores/authStore'
import { useConnectionStore } from '../../stores/connectionStore'
import { useOfflineStatus } from '../../hooks/useOfflineStatus'
import { disconnectSocket } from '../../services/socket'

interface Props {
  onMenuClick?: () => void
}

export default function TopBar({ onMenuClick }: Props) {
  const operator = useAuthStore((s) => s.operator)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const offline = useOfflineStatus()
  const connected = useConnectionStore((s) => s.connected)

  // LIVE only when the WebSocket is actually streaming
  const live = connected && !offline
  const statusColor = live ? '#10b981' : offline ? '#6b7280' : '#f59e0b'
  const statusLabel = live ? 'LIVE' : offline ? 'OFFLINE' : 'CONNECTING'

  function handleLogout() {
    disconnectSocket()
    clearAuth()
  }

  return (
    <header
      className="flex items-center justify-between px-4 h-14 shrink-0"
      style={{
        background: 'linear-gradient(180deg, #141d30, #111827)',
        borderBottom: '1px solid #1f2937',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="md:hidden text-lg leading-none"
          style={{ color: '#9ca3af' }}
        >
          ☰
        </button>
        <span
          className="text-lg font-bold tracking-widest"
          style={{
            background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          ◈ DRISHTI
        </span>
        <span className="text-xs hidden sm:inline" style={{ color: '#6b7280' }}>
          Telecom AI Operations
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Live indicator — reflects the real WebSocket connection */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            {live && (
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: statusColor }}
              />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: statusColor }} />
          </span>
          <span className="text-xs" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>

        {/* Operator dropdown */}
        <div className="flex items-center gap-2 pl-4" style={{ borderLeft: '1px solid #1f2937' }}>
          <div className="text-right">
            <div className="text-xs font-medium" style={{ color: '#f9fafb' }}>
              {operator?.name ?? 'Operator'}
            </div>
            <div className="text-xs" style={{ color: '#6b7280' }}>
              {operator?.role ?? 'operator'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  )
}
