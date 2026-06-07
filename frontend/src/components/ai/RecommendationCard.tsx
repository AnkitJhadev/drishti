import type { AIRecommendation } from '../../types/ai'

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  low:      { bg: '#374151', text: '#9ca3af' },
  medium:   { bg: '#92400e', text: '#fcd34d' },
  high:     { bg: '#7c2d12', text: '#fb923c' },
  critical: { bg: '#7f1d1d', text: '#f87171' },
}

interface Props {
  recommendation: AIRecommendation
}

export default function RecommendationCard({ recommendation: r }: Props) {
  const pri = PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.low
  const confidencePct = Math.round((r.confidence ?? 0) * 100)

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {r.tower_id && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: '#0a0f1e', color: '#f59e0b' }}>
              {r.tower_id}
            </span>
          )}
          <span
            className="text-xs px-1.5 py-0.5 rounded uppercase font-medium"
            style={{ background: pri.bg, color: pri.text }}
          >
            {r.priority}
          </span>
        </div>
        <span className="text-xs" style={{ color: '#6b7280' }}>
          {confidencePct}% confidence
        </span>
      </div>

      {/* Root cause */}
      <div className="mb-2">
        <div className="text-xs font-semibold mb-0.5" style={{ color: '#9ca3af' }}>
          ROOT CAUSE
        </div>
        <p className="text-sm" style={{ color: '#f9fafb' }}>
          {r.root_cause}
        </p>
      </div>

      {/* Suggested action */}
      <div className="mb-2">
        <div className="text-xs font-semibold mb-0.5" style={{ color: '#9ca3af' }}>
          SUGGESTED ACTION
        </div>
        <p className="text-sm" style={{ color: '#f9fafb' }}>
          {r.suggested_action}
        </p>
      </div>

      {/* Affected users */}
      <div className="text-xs" style={{ color: '#6b7280' }}>
        ~{(r.affected_users ?? 0).toLocaleString()} users affected
      </div>
    </div>
  )
}
