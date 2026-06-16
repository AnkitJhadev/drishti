import type { AIRecommendation } from '../../types/ai'
import type { Severity } from '../../types/complaint'
import { color, SEVERITY } from '../../theme/tokens'

interface Props {
  recommendation: AIRecommendation
}

export default function RecommendationCard({ recommendation: r }: Props) {
  // Priority shares the severity scale (low|medium|high|critical).
  const pri = SEVERITY[r.priority as Severity] ?? SEVERITY.low
  const confidencePct = Math.round((r.confidence ?? 0) * 100)

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {r.tower_id && (
            <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: color.bg.page, color: color.accent }}>
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
        <span className="text-xs" style={{ color: color.text.muted }}>
          {confidencePct}% confidence
        </span>
      </div>

      {/* Root cause */}
      <div className="mb-2">
        <div className="text-xs font-semibold mb-0.5" style={{ color: color.text.secondary }}>
          ROOT CAUSE
        </div>
        <p className="text-sm" style={{ color: color.text.primary }}>
          {r.root_cause}
        </p>
      </div>

      {/* Suggested action */}
      <div className="mb-2">
        <div className="text-xs font-semibold mb-0.5" style={{ color: color.text.secondary }}>
          SUGGESTED ACTION
        </div>
        <p className="text-sm" style={{ color: color.text.primary }}>
          {r.suggested_action}
        </p>
      </div>

      {/* Affected users */}
      <div className="text-xs" style={{ color: color.text.muted }}>
        ~{(r.affected_users ?? 0).toLocaleString()} users affected
      </div>
    </div>
  )
}
