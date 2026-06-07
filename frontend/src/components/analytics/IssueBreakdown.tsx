import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useComplaintsStore } from '../../stores/complaintsStore'
import type { IssueType } from '../../types/complaint'

const ISSUE_COLOR: Record<string, string> = {
  network_outage: '#ef4444',
  tower_failure: '#f97316',
  call_drop: '#f59e0b',
  slow_internet: '#3b82f6',
  billing_issue: '#8b5cf6',
  unknown: '#6b7280',
}

const ISSUE_LABEL: Record<string, string> = {
  network_outage: 'Network Outage',
  tower_failure: 'Tower Failure',
  call_drop: 'Call Drop',
  slow_internet: 'Slow Internet',
  billing_issue: 'Billing',
  unknown: 'Unclassified',
}

export default function IssueBreakdown() {
  const complaints = useComplaintsStore((s) => s.complaints)

  const counts = complaints.reduce<Record<string, number>>((acc, c) => {
    const key: IssueType = c.issue_type ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const data = Object.entries(counts)
    .map(([key, value]) => ({ name: ISSUE_LABEL[key] ?? key, value, key }))
    .sort((a, b) => b.value - a.value)

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: '#6b7280' }}>
        No data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
          stroke="#0a0f1e"
        >
          {data.map((entry) => (
            <Cell key={entry.key} fill={ISSUE_COLOR[entry.key] ?? '#6b7280'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: '#1a2235',
            border: '1px solid #1f2937',
            borderRadius: 6,
            fontSize: 12,
            color: '#f9fafb',
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
