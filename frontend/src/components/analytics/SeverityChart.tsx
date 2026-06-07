import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useComplaintsStore } from '../../stores/complaintsStore'
import type { Severity } from '../../types/complaint'

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low']
const COLOR: Record<Severity, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6b7280',
}

export default function SeverityChart() {
  const complaints = useComplaintsStore((s) => s.complaints)
  const data = ORDER.map((sev) => ({
    name: sev,
    value: complaints.filter((c) => c.severity === sev).length,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} stroke="#1f2937" width={60} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{ background: '#1a2235', border: '1px solid #1f2937', borderRadius: 6, fontSize: 12, color: '#f9fafb' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={COLOR[d.name as Severity]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
