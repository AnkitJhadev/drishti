import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useComplaintsStore } from '../../stores/complaintsStore'
import ComplaintCard from './ComplaintCard'
import { color } from '../../theme/tokens'
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

  const filtered = useMemo(
    () => (filter === 'all' ? complaints : complaints.filter((c) => c.severity === filter)),
    [complaints, filter]
  )

  // Virtualize the feed so only on-screen cards mount — keeps the list smooth
  // on low-spec clients even with hundreds of complaints.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (i) => filtered[i].id,
  })

  return (
    <div className="dr-panel h-full flex flex-col">
      {/* Header */}
      <div className="dr-panel-header shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color.success }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color.success }} />
          </span>
          <h2 className="dr-title">Live Complaint Feed</h2>
          <span className="dr-chip" style={{ background: color.bg.elevated, color: color.text.secondary }}>
            {filtered.length}
          </span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Filter by severity">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                background: filter === f.value ? color.accent : color.bg.elevated,
                color: filter === f.value ? color.bg.page : color.text.secondary,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List — ARIA live region so screen readers announce newly-added complaints */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Live complaint feed"
      >
        {loading && complaints.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="dr-skeleton" style={{ height: 64 }} />
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: color.text.muted }}>
            No complaints yet. Upload some via the Ingestion panel.
          </p>
        )}
        {filtered.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
              >
                <ComplaintCard complaint={filtered[item.index]} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
