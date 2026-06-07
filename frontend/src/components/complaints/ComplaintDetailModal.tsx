import { useEffect, useState, type ReactNode } from 'react'
import api from '../../services/api'
import { useComplaintsStore } from '../../stores/complaintsStore'
import type { Severity } from '../../types/complaint'

interface ComplaintDetail {
  id: string
  source: string
  raw_text: string
  location_hint: string | null
  lat: number | null
  lng: number | null
  sender: string | null
  timestamp: string
  status: string
  issue_type: string | null
  severity: Severity | null
  confidence: number | null
  cluster_id: string | null
  tower_id: string | null
  tower_name?: string | null
  tower_status?: string | null
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string }> = {
  low: { bg: '#374151', text: '#9ca3af' },
  medium: { bg: '#92400e', text: '#fcd34d' },
  high: { bg: '#7c2d12', text: '#fb923c' },
  critical: { bg: '#7f1d1d', text: '#f87171' },
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b', processing: '#f59e0b', clustered: '#3b82f6',
  recommended: '#8b5cf6', approved: '#10b981', resolved: '#10b981', rejected: '#ef4444',
}

interface Props {
  complaintId: string
  onClose: () => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-0.5" style={{ color: '#6b7280' }}>{label}</div>
      <div className="text-sm" style={{ color: '#f9fafb' }}>{children}</div>
    </div>
  )
}

export default function ComplaintDetailModal({ complaintId, onClose }: Props) {
  const [detail, setDetail] = useState<ComplaintDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const resolveInStore = useComplaintsStore((s) => s.resolveComplaint)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.get<{ complaint: ComplaintDetail }>(`/complaints/${complaintId}`)
      .then(({ data }) => { if (active) setDetail(data.complaint) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [complaintId])

  async function resolve() {
    setBusy(true)
    resolveInStore(complaintId)
    try {
      await api.patch(`/complaints/${complaintId}/resolve`)
      setDetail((d) => (d ? { ...d, status: 'resolved' } : d))
    } catch {
      // reconciled via socket
    } finally {
      setBusy(false)
    }
  }

  const sev = detail?.severity ? SEVERITY_STYLE[detail.severity] : SEVERITY_STYLE.low
  const confidencePct = Math.round((detail?.confidence ?? 0) * 100)
  const isResolved = detail?.status === 'resolved'

  return (
    <div
      className="fixed inset-0 z-[1700] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div className="dr-panel w-full max-w-lg dr-fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dr-panel-header">
          <h2 className="dr-title">Complaint Detail</h2>
          <button onClick={onClose} className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>

        {loading || !detail ? (
          <div className="p-6 text-center text-xs" style={{ color: '#6b7280' }}>Loading…</div>
        ) : (
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="dr-chip" style={{ background: sev.bg, color: sev.text, textTransform: 'uppercase' }}>
                {detail.severity ?? '—'}
              </span>
              <span className="dr-chip" style={{ background: '#1a2235', color: STATUS_COLOR[detail.status] ?? '#9ca3af' }}>
                {detail.status}
              </span>
              <span className="dr-chip" style={{ background: '#1a2235', color: '#9ca3af' }}>
                {(detail.issue_type ?? 'unknown').replace(/_/g, ' ')}
              </span>
              <span className="dr-chip" style={{ background: '#1a2235', color: '#6b7280' }}>
                via {detail.source}
              </span>
            </div>

            {/* Complaint text */}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>COMPLAINT</div>
              <p className="text-sm p-3 rounded" style={{ color: '#f9fafb', background: '#0a0f1e', border: '1px solid #1f2937' }}>
                {detail.raw_text}
              </p>
            </div>

            {/* AI classification */}
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>AI CLASSIFICATION</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: '#0a0f1e' }}>
                  <div className="h-full rounded-full" style={{ width: `${confidencePct}%`, background: '#f59e0b' }} />
                </div>
                <span className="text-xs" style={{ color: '#9ca3af' }}>{confidencePct}% confidence</span>
              </div>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="LOCATION">{detail.location_hint || 'Unknown'}</Field>
              <Field label="COORDINATES">
                {detail.lat && detail.lng ? `${detail.lat.toFixed(3)}, ${detail.lng.toFixed(3)}` : '—'}
              </Field>
              <Field label="TOWER">
                {detail.tower_id ? (
                  <span>
                    <span className="font-mono">{detail.tower_id}</span>
                    {detail.tower_name ? ` · ${detail.tower_name}` : ''}
                  </span>
                ) : 'Not correlated'}
              </Field>
              <Field label="SENDER">{detail.sender || '—'}</Field>
              <Field label="REPORTED">{new Date(detail.timestamp).toLocaleString()}</Field>
              <Field label="CLUSTER">{detail.cluster_id ? detail.cluster_id.slice(0, 8) : '—'}</Field>
            </div>

            {/* Resolve action */}
            {isResolved ? (
              <div className="text-center py-2 rounded text-sm font-semibold" style={{ background: '#064e3b', color: '#6ee7b7' }}>
                ✓ Resolved
              </div>
            ) : (
              <button
                onClick={resolve}
                disabled={busy}
                className="w-full py-2.5 rounded text-sm font-semibold transition-opacity disabled:opacity-50"
                style={{ background: '#10b981', color: '#0a0f1e' }}
              >
                {busy ? 'Resolving…' : '✓ Mark Resolved'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
