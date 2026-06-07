import { useState } from 'react'
import { useAlertsStore } from '../../stores/alertsStore'
import IngestionPanel from '../complaints/IngestionPanel'
import type { AlertSeverity } from '../../types/alert'

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: '#3b82f6',
  warning: '#f97316',
  critical: '#ef4444',
}

const NAV_ITEMS = [
  { icon: '◫', label: 'Dashboard', active: true },
  { icon: '◉', label: 'Towers', active: false },
  { icon: '☰', label: 'Complaints', active: false },
  { icon: '◔', label: 'Analytics', active: false },
]

export default function Sidebar() {
  const alerts = useAlertsStore((s) => s.alerts)
  const unread = alerts.filter((a) => !a.read).length
  const [ingestOpen, setIngestOpen] = useState(false)

  return (
    <aside
      className="w-56 shrink-0 flex flex-col"
      style={{ background: '#111827', borderRight: '1px solid #1f2937' }}
    >
      {/* Nav */}
      <nav className="p-2">
        {NAV_ITEMS.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 px-3 py-2 rounded mb-1 cursor-pointer text-sm transition-colors"
            style={{
              background: item.active ? '#1a2235' : 'transparent',
              color: item.active ? '#f59e0b' : '#9ca3af',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}

        {/* Ingest button */}
        <button
          onClick={() => setIngestOpen(true)}
          className="dr-btn-accent w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 text-sm"
        >
          <span>＋</span>
          <span>Ingest Complaints</span>
        </button>
      </nav>

      <IngestionPanel open={ingestOpen} onClose={() => setIngestOpen(false)} />

      {/* Alerts feed */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ borderTop: '1px solid #1f2937' }}>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold tracking-wide" style={{ color: '#9ca3af' }}>
            ALERTS
          </span>
          {unread > 0 && (
            <span
              className="text-xs px-1.5 rounded-full font-bold"
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {unread}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {alerts.length === 0 && (
            <p className="text-xs px-2 py-4 text-center" style={{ color: '#6b7280' }}>
              No alerts yet
            </p>
          )}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="px-2 py-2 mb-1 rounded text-xs"
              style={{
                background: alert.read ? 'transparent' : '#1a2235',
                borderLeft: `2px solid ${SEVERITY_COLOR[alert.severity]}`,
              }}
            >
              <div className="font-medium mb-0.5" style={{ color: '#f9fafb' }}>
                {alert.title}
              </div>
              <div style={{ color: '#9ca3af' }} className="line-clamp-2">
                {alert.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
