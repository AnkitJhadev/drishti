import ApprovalCard from './ApprovalCard'
import { useAIChatStore } from '../../stores/aiChatStore'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ApprovalPanel({ open, onClose }: Props) {
  const recommendations = useAIChatStore((s) => s.recommendations)
  const pending = recommendations.filter((r) => r.status === 'pending')

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[1500]"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 h-full z-[1600] flex flex-col transition-transform duration-300"
        style={{
          width: 380,
          background: '#111827',
          borderLeft: '1px solid #1f2937',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: '#f9fafb' }}>
              Pending Approvals
            </h2>
            <span className="text-xs px-1.5 rounded-full font-bold" style={{ background: '#f59e0b', color: '#0a0f1e' }}>
              {pending.length}
            </span>
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: '#9ca3af' }}>
            ✕
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {pending.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-1">
              <span style={{ color: '#10b981', fontSize: 24 }}>✓</span>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                No pending recommendations
              </p>
            </div>
          ) : (
            pending.map((r) => <ApprovalCard key={r.id} recommendation={r} />)
          )}
        </div>
      </aside>
    </>
  )
}
