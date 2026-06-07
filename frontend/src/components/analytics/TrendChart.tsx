import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useComplaintsStore } from '../../stores/complaintsStore'

// Buckets complaints into the last 12 hours by hour.
function buildHourlyBuckets(timestamps: string[]): { label: string; count: number }[] {
  const now = Date.now()
  const buckets: { label: string; count: number; start: number }[] = []

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now - i * 3600_000)
    const hour = d.getHours()
    buckets.push({
      label: `${hour.toString().padStart(2, '0')}:00`,
      count: 0,
      start: new Date(d).setMinutes(0, 0, 0),
    })
  }

  for (const ts of timestamps) {
    const t = new Date(ts).getTime()
    for (let i = 0; i < buckets.length; i++) {
      const next = buckets[i + 1]?.start ?? Infinity
      if (t >= buckets[i].start && t < next) {
        buckets[i].count++
        break
      }
    }
  }

  return buckets.map(({ label, count }) => ({ label, count }))
}

export default function TrendChart() {
  const complaints = useComplaintsStore((s) => s.complaints)
  const data = buildHourlyBuckets(complaints.map((c) => c.timestamp))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" interval={1} />
        <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} stroke="#1f2937" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: '#1a2235',
            border: '1px solid #1f2937',
            borderRadius: 6,
            fontSize: 12,
            color: '#f9fafb',
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ r: 2, fill: '#f59e0b' }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
