import { useState, type MouseEvent } from 'react'
import type { EnrichedComplaint, Severity } from '../../types/complaint'
import { useComplaintsStore } from '../../stores/complaintsStore'
import ComplaintDetailModal from './ComplaintDetailModal'
import api from '../../services/api'

const SEVERITY_STYLE: Record<Severity, { bg: string; text: string }> = {
  low:      { bg: '#374151', text: '#9ca3af' },
  medium:   { bg: '#92400e', text: '#fcd34d' },
  high:     { bg: '#7c2d12', text: '#fb923c' },
  critical: { bg: '#7f1d1d', text: '#f87171' },
}

const SOURCE_ICON: Record<string, string> = {
  email: '✉',
  pdf: '▤',
  image: '▣',
  sms: '✆',
  csv: '▦',
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

export default function ComplaintCard({ complaint }: Props) {
  const sev = SEVERITY_STYLE[complaint.severity] ?? SEVERITY_STYLE.low
  const isPending = complaint.status === 'pending'
  const isResolved = complaint.status === 'resolved'
  const accent = isResolved ? '#10b981' : sev.text

  const resolveInStore = useComplaintsStore((s) => s.resolveComplaint)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function resolve(e: MouseEvent) {
    e.stopPropagation() // don't open the modal
    setBusy(true)
    resolveInStore(complaint.id) // optimistic
    try {
      await api.patch(`/complaints/${complaint.id}/resolve`)
    } catch {
      // socket/refresh will reconcile
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={() => setOpen(true)}
      className="dr-card dr-fade-in px-3 py-2.5 mb-2 relative overflow-hidden group cursor-pointer"
      style={{ borderLeft: `3px solid ${accent}`, opacity: isResolved ? 0.65 : 1 }}
    >
      {open && <ComplaintDetailModal complaintId={complaint.id} onClose={() => setOpen(false)} />}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ color: '#6b7280' }}>{SOURCE_ICON[complaint.source] ?? '•'}</span>
          <span className="text-xs truncate" style={{ color: '#9ca3af' }}>
            {complaint.location_hint || 'Unknown location'}
          </span>
        </div>
        {isResolved ? (
          <span className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium" style={{ background: '#064e3b', color: '#6ee7b7' }}>
            ✓ RESOLVED
          </span>
        ) : (
          <span
            className="text-xs px-1.5 py-0.5 rounded shrink-0 font-medium uppercase"
            style={{ background: sev.bg, color: sev.text }}
          >
            {complaint.severity}
          </span>
        )}
      </div>

      <p className="text-sm mb-1.5 line-clamp-2" style={{ color: '#f9fafb' }}>
        {complaint.raw_text}
      </p>

      <div className="flex items-center justify-between text-xs" style={{ color: '#6b7280' }}>
        <span>
          {isPending ? (
            <span style={{ color: '#f59e0b' }}>● analyzing…</span>
          ) : (
            <span style={{ color: '#9ca3af' }}>{complaint.issue_type?.replace(/_/g, ' ') ?? 'unknown'}</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <span>{timeAgo(complaint.timestamp)}</span>
          {!isResolved && !isPending && (
            <button
              onClick={resolve}
              disabled={busy}
              className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
              style={{ background: '#10b981', color: '#0a0f1e' }}
              title="Mark this complaint resolved"
            >
              {busy ? '…' : '✓ Resolve'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
