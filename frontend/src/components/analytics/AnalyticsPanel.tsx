import { useState } from 'react'
import IssueBreakdown from './IssueBreakdown'
import TrendChart from './TrendChart'
import { useComplaintsStore } from '../../stores/complaintsStore'
import { useTowersStore } from '../../stores/towersStore'

type Tab = 'breakdown' | 'trend'

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex-1 px-2 py-2 rounded" style={{ background: '#1a2235' }}>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: '#6b7280' }}>
        {label}
      </div>
    </div>
  )
}

export default function AnalyticsPanel() {
  const [tab, setTab] = useState<Tab>('breakdown')
  const complaints = useComplaintsStore((s) => s.complaints)
  const towers = useTowersStore((s) => s.towers)

  const criticalCount = complaints.filter((c) => c.severity === 'critical').length
  const affectedTowers = towers.filter((t) => t.status !== 'operational').length

  return (
    <div className="h-full flex flex-col rounded" style={{ background: '#111827', border: '1px solid #1f2937' }}>
      {/* Header */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#f9fafb' }}>
          Live Metrics
        </h2>

        {/* Summary stats */}
        <div className="flex gap-2 mb-3">
          <Stat label="Complaints" value={complaints.length} color="#f9fafb" />
          <Stat label="Critical" value={criticalCount} color="#ef4444" />
          <Stat label="Towers hit" value={affectedTowers} color="#f97316" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {(['breakdown', 'trend'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 text-xs py-1.5 rounded transition-colors capitalize"
              style={{
                background: tab === t ? '#f59e0b' : '#1a2235',
                color: tab === t ? '#0a0f1e' : '#9ca3af',
              }}
            >
              {t === 'breakdown' ? 'Issue Breakdown' : 'Trend (12h)'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 p-3" style={{ minHeight: 0 }}>
        {tab === 'breakdown' ? <IssueBreakdown /> : <TrendChart />}
      </div>
    </div>
  )
}
