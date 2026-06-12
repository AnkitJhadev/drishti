import { useState } from 'react'
import ApprovalCard from './ApprovalCard'
import RecommendationCard from '../ai/RecommendationCard'
import { useAIChatStore } from '../../stores/aiChatStore'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { sendOrQueue } from '../../services/actionQueue'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'pending' | 'progress'

export default function ApprovalPanel({ open, onClose }: Props) {
  const recommendations = useAIChatStore((s) => s.recommendations)
  const [tab, setTab] = useState<Tab>('pending')
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const pending = recommendations.filter((r) => r.status === 'pending')
  const inProgress = recommendations.filter((r) => r.status === 'approved' && !resolvedIds.has(r.id))

  async function resolve(id: string) {
    setBusyId(id)
    try {
      await sendOrQueue({ url: `/recommendations/${id}/resolve`, label: 'resolve recommendation' })
      setResolvedIds((prev) => new Set(prev).add(id))
    } catch {
      // keep card
    } finally {
      setBusyId(null)
    }
  }

  const list = tab === 'pending' ? pending : inProgress

  useEscapeKey(open, onClose)

  return (
    <>
      {open && <div className="fixed inset-0 z-[1500]" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />}

      <aside
        className="fixed top-0 right-0 h-full z-[1600] flex flex-col transition-transform duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Approvals"
        aria-hidden={!open}
        style={{
          width: 'min(380px, 100vw)',
          background: '#111827',
          borderLeft: '1px solid #1f2937',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <h2 className="dr-title">Approvals</h2>
          <button onClick={onClose} aria-label="Close" className="text-sm" style={{ color: '#9ca3af' }}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-3 py-2 shrink-0">
          {([
            { key: 'pending' as Tab, label: 'Pending', count: pending.length },
            { key: 'progress' as Tab, label: 'In Progress', count: inProgress.length },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-xs py-1.5 rounded transition-colors"
              style={{ background: tab === t.key ? '#f59e0b' : '#1a2235', color: tab === t.key ? '#0a0f1e' : '#9ca3af' }}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {list.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-1">
              <span style={{ color: '#10b981', fontSize: 24 }}>✓</span>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                {tab === 'pending' ? 'No pending recommendations' : 'Nothing in progress'}
              </p>
            </div>
          ) : tab === 'pending' ? (
            list.map((r) => <ApprovalCard key={r.id} recommendation={r} />)
          ) : (
            list.map((r) => (
              <div key={r.id} className="dr-card dr-fade-in p-3 mb-3">
                <RecommendationCard recommendation={r} />
                <button
                  onClick={() => resolve(r.id)}
                  disabled={busyId === r.id}
                  className="w-full mt-3 py-1.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: '#10b981', color: '#0a0f1e' }}
                >
                  {busyId === r.id ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <span className="dr-spinner" style={{ width: 10, height: 10 }} />
                      Resolving…
                    </span>
                  ) : (
                    '✓ Mark Resolved — restore tower'
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
