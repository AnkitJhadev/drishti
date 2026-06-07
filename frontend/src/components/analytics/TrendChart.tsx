import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useComplaintsStore } from '../../stores/complaintsStore'

const BUCKETS = 12

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

// Adaptive buckets: spread complaints across the actual time range of the data.
// If everything arrived in a tight window, buckets are minutes; if spread over
// days, buckets are larger — so the line is always meaningful.
function buildBuckets(timestamps: number[]): { label: string; count: number }[] {
  if (timestamps.length === 0) {
    return Array.from({ length: BUCKETS }, (_, i) => ({ label: `${i}`, count: 0 }))
  }

  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  // Guard: if all identical, widen the window so we still get a span.
  const span = Math.max(max - min, 60_000)
  const step = span / BUCKETS

  const buckets = Array.from({ length: BUCKETS }, (_, i) => {
    const start = min + i * step
    const d = new Date(start)
    return { label: `${pad(d.getHours())}:${pad(d.getMinutes())}`, count: 0, start }
  })

  for (const t of timestamps) {
    let idx = Math.floor((t - min) / step)
    if (idx >= BUCKETS) idx = BUCKETS - 1
    if (idx < 0) idx = 0
    buckets[idx].count++
  }

  return buckets.map(({ label, count }) => ({ label, count }))
}

export default function TrendChart() {
  const complaints = useComplaintsStore((s) => s.complaints)
  const data = buildBuckets(complaints.map((c) => new Date(c.timestamp).getTime()).filter((n) => !isNaN(n)))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" interval={1} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a2235', border: '1px solid #1f2937', borderRadius: 6, fontSize: 12, color: '#f9fafb' }}
          labelStyle={{ color: '#9ca3af' }}
        />
        <Area type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2} fill="url(#trendFill)" dot={{ r: 2, fill: '#f59e0b' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
