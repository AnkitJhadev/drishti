import { useState } from 'react'
import RecommendationCard from '../ai/RecommendationCard'
import { useAIChatStore } from '../../stores/aiChatStore'
import { sendOrQueue } from '../../services/actionQueue'
import { color } from '../../theme/tokens'
import type { AIRecommendation } from '../../types/ai'

type Action = 'approve' | 'reject' | 'escalate'

interface Props {
  recommendation: AIRecommendation
}

export default function ApprovalCard({ recommendation }: Props) {
  const updateStatus = useAIChatStore((s) => s.updateRecommendationStatus)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [showNote, setShowNote] = useState(false)

  async function act(action: Action) {
    setBusy(action)
    try {
      // Sent now, or queued if offline — either way we optimistically update.
      await sendOrQueue({
        url: `/recommendations/${recommendation.id}/${action}`,
        body: { note: note || undefined },
        label: `${action} recommendation`,
      })
      const newStatus =
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending'
      // Escalate keeps it pending but flag handled server-side; approve/reject remove from list
      if (action !== 'escalate') {
        updateStatus(recommendation.id, newStatus as AIRecommendation['status'], note || undefined)
      }
    } catch {
      // genuine server rejection — keep card
    } finally {
      setBusy(null)
    }
  }

  const busyLabel =
    busy === 'approve' ? 'Approving…' : busy === 'reject' ? 'Rejecting…' : busy === 'escalate' ? 'Escalating…' : null

  return (
    <div className="dr-card dr-fade-in p-3 mb-3 relative" aria-busy={busy !== null}>
      {busy && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(17, 24, 39, 0.8)' }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: color.text.primary }}>
            <span className="dr-spinner" style={{ width: 14, height: 14, color: color.accent }} />
            {busyLabel}
          </span>
        </div>
      )}

      <RecommendationCard recommendation={recommendation} />

      {/* Optional note */}
      {showNote ? (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add an operator note (optional)…"
          rows={2}
          className="w-full mt-3 px-2 py-1.5 rounded text-xs outline-none resize-none"
          style={{ background: color.bg.page, border: `1px solid ${color.border.base}`, color: color.text.primary }}
        />
      ) : (
        <button
          onClick={() => setShowNote(true)}
          className="text-xs mt-2"
          style={{ color: color.text.muted }}
        >
          + Add note
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => act('approve')}
          disabled={busy !== null}
          className="flex-1 py-1.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ background: color.success, color: color.bg.page }}
        >
          ✓ Approve
        </button>
        <button
          onClick={() => act('reject')}
          disabled={busy !== null}
          className="flex-1 py-1.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ background: '#7f1d1d', color: '#f87171' }}
        >
          ✕ Reject
        </button>
        <button
          onClick={() => act('escalate')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded text-xs font-semibold transition-opacity disabled:opacity-50"
          style={{ background: color.border.base, color: '#fb923c' }}
        >
          ⤴ Escalate
        </button>
      </div>
    </div>
  )
}
