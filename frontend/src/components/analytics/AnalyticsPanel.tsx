import { useState } from 'react'
import IssueBreakdown from './IssueBreakdown'
import SeverityChart from './SeverityChart'
import TrendChart from './TrendChart'
import TopTowers from './TopTowers'

type Tab = 'breakdown' | 'severity' | 'trend' | 'towers'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'breakdown', label: 'Issues' },
  { key: 'severity', label: 'Severity' },
  { key: 'trend', label: 'Trend' },
  { key: 'towers', label: 'Top Towers' },
]

export default function AnalyticsPanel() {
  const [tab, setTab] = useState<Tab>('breakdown')

  return (
    <div className="dr-panel h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
        <h2 className="dr-title mb-2">Live Analytics</h2>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-xs py-1.5 rounded transition-colors"
              style={{
                background: tab === t.key ? '#f59e0b' : '#1a2235',
                color: tab === t.key ? '#0a0f1e' : '#9ca3af',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 p-3" style={{ minHeight: 0 }}>
        {tab === 'breakdown' && <IssueBreakdown />}
        {tab === 'severity' && <SeverityChart />}
        {tab === 'trend' && <TrendChart />}
        {tab === 'towers' && <TopTowers />}
      </div>
    </div>
  )
}
