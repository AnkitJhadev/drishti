import { useState } from 'react'
import { useComplaintsStore } from '../../stores/complaintsStore'
import ComplaintCard from './ComplaintCard'
import type { Severity } from '../../types/complaint'

const FILTERS: Array<{ label: string; value: Severity | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

export default function ComplaintFeed() {
  const complaints = useComplaintsStore((s) => s.complaints)
  const loading = useComplaintsStore((s) => s.loading)
  const [filter, setFilter] = useState<Severity | 'all'>('all')

  const filtered =
    filter === 'all' ? complaints : complaints.filter((c) => c.severity === filter)

  return (
    <div className="dr-panel h-full flex flex-col">
      {/* Header */}
      <div className="dr-panel-header shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#10b981' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#10b981' }} />
          </span>
          <h2 className="dr-title">Live Complaint Feed</h2>
          <span className="dr-chip" style={{ background: '#1a2235', color: '#9ca3af' }}>
            {filtered.length}
          </span>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                background: filter === f.value ? '#f59e0b' : '#1a2235',
                color: filter === f.value ? '#0a0f1e' : '#9ca3af',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && complaints.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="dr-skeleton" style={{ height: 64 }} />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: '#6b7280' }}>
            No complaints yet. Upload some via the Ingestion panel.
          </p>
        )}
        {filtered.map((c) => (
          <ComplaintCard key={c.id} complaint={c} />
        ))}
      </div>
    </div>
  )
}
