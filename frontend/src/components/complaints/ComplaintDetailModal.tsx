import { useEffect, useState, type ReactNode } from 'react'
import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip,
} from 'recharts'
import api from '../../services/api'
import { useComplaintsStore } from '../../stores/complaintsStore'
import { sendOrQueue } from '../../services/actionQueue'
import Modal from '../Modal'
import type { Severity } from '../../types/complaint'

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
const SEV_COLOR: Record<Severity, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#6b7280',
}

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
  const allComplaints = useComplaintsStore((s) => s.complaints)

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
      await sendOrQueue({ url: `/complaints/${complaintId}/resolve`, label: 'resolve complaint' })
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

  // Context: related complaints (same tower, else same issue type), by severity
  const related = detail
    ? allComplaints.filter((c) =>
        detail.tower_id ? c.tower_id === detail.tower_id : c.issue_type === detail.issue_type
      )
    : []
  const severityData = SEV_ORDER.map((s) => ({
    name: s,
    value: related.filter((c) => c.severity === s).length,
  }))
  const gaugeData = [{ name: 'confidence', value: confidencePct, fill: '#f59e0b' }]
  const contextLabel = detail?.tower_id ? `tower ${detail.tower_id}` : `${(detail?.issue_type ?? '').replace(/_/g, ' ')}`

  return (
    <Modal open onClose={onClose} label="Complaint detail" panelClassName="dr-panel w-full max-w-lg dr-fade-in">
        {/* Header */}
        <div className="dr-panel-header">
          <h2 className="dr-title">Complaint Detail</h2>
          <button onClick={onClose} aria-label="Close" className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
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

            {/* Charts: AI confidence gauge + related-severity context */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded p-2" style={{ background: '#0a0f1e', border: '1px solid #1f2937' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>AI CONFIDENCE</div>
                <div className="relative" style={{ height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart innerRadius="72%" outerRadius="100%" data={gaugeData} startAngle={90} endAngle={-270}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#1a2235' }} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold" style={{ color: '#f59e0b' }}>{confidencePct}%</span>
                  </div>
                </div>
              </div>

              <div className="rounded p-2" style={{ background: '#0a0f1e', border: '1px solid #1f2937' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>
                  CONTEXT · {related.length} at {contextLabel}
                </div>
                <div style={{ height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={severityData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} stroke="#1f2937" />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        contentStyle={{ background: '#1a2235', border: '1px solid #1f2937', borderRadius: 6, fontSize: 11, color: '#f9fafb' }}
                      />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {severityData.map((d) => (
                          <Cell key={d.name} fill={SEV_COLOR[d.name as Severity]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
    </Modal>
  )
}
