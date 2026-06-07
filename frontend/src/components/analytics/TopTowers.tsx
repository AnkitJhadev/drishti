import { useTowersStore } from '../../stores/towersStore'
import type { TowerStatus } from '../../types/tower'

const STATUS_COLOR: Record<TowerStatus, string> = {
  operational: '#10b981',
  degraded: '#f97316',
  critical: '#ef4444',
  offline: '#6b7280',
}

export default function TopTowers() {
  const towers = useTowersStore((s) => s.towers)
  const ranked = [...towers]
    .filter((t) => t.active_complaints > 0)
    .sort((a, b) => b.active_complaints - a.active_complaints)
    .slice(0, 8)

  const max = Math.max(1, ...ranked.map((t) => t.active_complaints))

  if (ranked.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>
        No affected towers
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-2">
      {ranked.map((t) => (
        <div key={t.id}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5" style={{ color: '#f9fafb' }}>
              <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: STATUS_COLOR[t.status] }} />
              <span className="font-mono">{t.id}</span>
              <span style={{ color: '#6b7280' }}>{t.name.replace(/ (Tower|Hub|Sector)$/, '')}</span>
            </span>
            <span style={{ color: '#9ca3af' }}>{t.active_complaints}</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 6, background: '#0a0f1e' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(t.active_complaints / max) * 100}%`, background: STATUS_COLOR[t.status] }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
