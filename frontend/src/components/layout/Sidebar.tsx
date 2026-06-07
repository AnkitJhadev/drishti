import { useState } from 'react'
import { useAlertsStore } from '../../stores/alertsStore'
import IngestionPanel from '../complaints/IngestionPanel'
import type { AlertSeverity } from '../../types/alert'

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: '#3b82f6',
  warning: '#f97316',
  critical: '#ef4444',
}

const NAV_ITEMS: Array<{ icon: string; label: string; target: string | null }> = [
  { icon: '◫', label: 'Dashboard', target: null },
  { icon: '◉', label: 'Towers', target: 'section-towers' },
  { icon: '☰', label: 'Complaints', target: 'section-complaints' },
  { icon: '◔', label: 'Analytics', target: 'section-analytics' },
]

export default function Sidebar() {
  const alerts = useAlertsStore((s) => s.alerts)
  const unread = alerts.filter((a) => !a.read).length
  const [ingestOpen, setIngestOpen] = useState(false)
  const [active, setActive] = useState('Dashboard')

  function go(item: { label: string; target: string | null }) {
    setActive(item.label)
    if (item.target) {
      document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <aside
      className="w-56 shrink-0 flex flex-col"
      style={{ background: '#111827', borderRight: '1px solid #1f2937' }}
    >
      {/* Nav */}
      <nav className="p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            onClick={() => go(item)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded mb-1 cursor-pointer text-sm transition-colors text-left"
            style={{
              background: active === item.label ? '#1a2235' : 'transparent',
              color: active === item.label ? '#f59e0b' : '#9ca3af',
            }}
            onMouseEnter={(e) => { if (active !== item.label) e.currentTarget.style.background = '#161e2e' }}
            onMouseLeave={(e) => { if (active !== item.label) e.currentTarget.style.background = 'transparent' }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
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
