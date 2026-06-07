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
    <div className="h-full flex flex-col" style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>
            Live Complaint Feed
          </h2>
          <span className="text-xs px-1.5 rounded" style={{ background: '#1a2235', color: '#9ca3af' }}>
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
        {loading && (
          <p className="text-xs text-center py-8" style={{ color: '#6b7280' }}>
            Loading complaints…
          </p>
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
