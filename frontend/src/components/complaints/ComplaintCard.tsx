import { useState, lazy, Suspense, memo } from 'react'
import type { EnrichedComplaint } from '../../types/complaint'
import { color, SEVERITY, STATE } from '../../theme/tokens'

const ComplaintDetailModal = lazy(() => import('./ComplaintDetailModal'))

const SOURCE_ICON: Record<string, string> = {
  email: '✉', pdf: '▤', image: '▣', sms: '✆', csv: '▦',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface Props {
  complaint: EnrichedComplaint
}

// Memoized: the live feed re-renders on every socket push, but a card only
// needs to re-render when its own complaint object changes.
function ComplaintCard({ complaint }: Props) {
  const sev = SEVERITY[complaint.severity] ?? SEVERITY.low
  const isFailed = complaint.status === 'failed'
  const isPending = (complaint.status === 'pending' || complaint.status === 'processing') && !isFailed
  const isResolved = complaint.status === 'resolved'
  const accent = isResolved ? STATE.resolvedAccent : isFailed ? STATE.failedAccent : sev.text
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="dr-card dr-fade-in px-3 py-2.5 mb-2 relative overflow-hidden cursor-pointer"
        style={{ borderLeft: `3px solid ${accent}`, opacity: isResolved ? 0.65 : 1 }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" style={{ color: color.text.muted }}>{SOURCE_ICON[complaint.source] ?? '•'}</span>
            <span className="text-xs truncate" style={{ color: color.text.secondary }}>
              {complaint.location_hint || 'Unknown location'}
            </span>
          </div>
          {isResolved ? (
            <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium" style={{ background: STATE.resolvedBadge.bg, color: STATE.resolvedBadge.text }}>
              ✓ RESOLVED
            </span>
          ) : isFailed ? (
            <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium" style={{ background: STATE.failedBadge.bg, color: STATE.failedBadge.text }}>
              ⚠ NOT CLASSIFIED
            </span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium uppercase" style={{ background: sev.bg, color: sev.text }}>
              {complaint.severity}
            </span>
          )}
        </div>

        <p className="text-sm mb-1.5 line-clamp-2" style={{ color: color.text.primary }}>
          {complaint.raw_text}
        </p>

        <div className="flex items-center justify-between text-xs gap-2" style={{ color: color.text.muted }}>
          <span className="min-w-0 truncate">
            {isFailed ? (
              <span style={{ color: STATE.failedText }} title={complaint.error ?? 'Classification failed'}>
                ⚠ {complaint.error ?? 'Could not classify — try again later'}
              </span>
            ) : isPending ? (
              <span style={{ color: color.accent }}>● analyzing…</span>
            ) : (
              <span style={{ color: color.text.secondary }}>{complaint.issue_type?.replace(/_/g, ' ') ?? 'unknown'}</span>
            )}
          </span>
          <span className="shrink-0">{timeAgo(complaint.timestamp)}</span>
        </div>
      </div>

      {open && (
        <Suspense fallback={null}>
          <ComplaintDetailModal complaintId={complaint.id} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}

export default memo(ComplaintCard)
