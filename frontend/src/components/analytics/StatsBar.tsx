import { useComplaintsStore } from '../../stores/complaintsStore'
import { useTowersStore } from '../../stores/towersStore'

interface Kpi {
  label: string
  value: string | number
  color: string
  icon: string
  sub?: string
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="dr-card px-4 py-3 flex items-center gap-3">
      <div
        className="flex items-center justify-center rounded-lg shrink-0"
        style={{ width: 38, height: 38, background: '#0a0f1e', color: kpi.color, fontSize: 18 }}
      >
        {kpi.icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-tight truncate" style={{ color: kpi.color }}>
          {kpi.value}
        </div>
        <div className="text-xs truncate" style={{ color: '#9ca3af' }}>
          {kpi.label}
        </div>
      </div>
    </div>
  )
}

export default function StatsBar() {
  const complaints = useComplaintsStore((s) => s.complaints)
  const towers = useTowersStore((s) => s.towers)

  const critical = complaints.filter((c) => c.severity === 'critical').length
  const highPlus = complaints.filter((c) => c.severity === 'critical' || c.severity === 'high').length
  const resolved = complaints.filter((c) => c.status === 'resolved').length
  const affectedTowers = towers.filter((t) => t.status !== 'operational').length
  const affectedUsers = towers.reduce((sum, t) => sum + (t.affected_users || 0), 0)
  const opPct = towers.length ? Math.round((towers.filter((t) => t.status === 'operational').length / towers.length) * 100) : 100

  const kpis: Kpi[] = [
    { label: 'Total Complaints', value: complaints.length, color: '#f9fafb', icon: '☰' },
    { label: 'Critical', value: critical, color: '#ef4444', icon: '⚠' },
    { label: 'High + Critical', value: highPlus, color: '#f97316', icon: '▲' },
    { label: 'Affected Users', value: affectedUsers.toLocaleString(), color: '#f59e0b', icon: '◉' },
    { label: 'Towers Affected', value: `${affectedTowers}/${towers.length}`, color: '#3b82f6', icon: '⌖' },
    { label: 'Network Health', value: `${opPct}%`, color: '#10b981', icon: '✓', sub: 'operational' },
    { label: 'Resolved', value: resolved, color: '#10b981', icon: '✔' },
  ]

  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {kpis.map((k) => (
        <KpiCard key={k.label} kpi={k} />
      ))}
    </div>
  )
}
