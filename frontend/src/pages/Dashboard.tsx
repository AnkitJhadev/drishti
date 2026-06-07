import { useEffect } from 'react'
import Layout from '../components/layout/Layout'
import ComplaintFeed from '../components/complaints/ComplaintFeed'
import { useComplaints } from '../hooks/useComplaints'
import { useTowers } from '../hooks/useTowers'
import { useAlerts } from '../hooks/useAlerts'
import { useAuthStore } from '../stores/authStore'
import { connectSocket } from '../services/socket'

function Placeholder({ label }: { label: string }) {
  return (
    <div
      className="h-full flex items-center justify-center rounded"
      style={{ background: '#111827', border: '1px dashed #1f2937', color: '#6b7280' }}
    >
      <span className="text-xs">{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const token = useAuthStore((s) => s.token)

  // Load initial data
  useComplaints()
  useTowers()
  useAlerts()

  // Ensure socket is connected (e.g. after navigation)
  useEffect(() => {
    if (token) connectSocket(token)
  }, [token])

  return (
    <Layout>
      <div className="h-full p-3 grid gap-3" style={{ gridTemplateColumns: '1fr 340px', gridTemplateRows: '1fr 1fr' }}>
        {/* Map — Hour 8 */}
        <div style={{ gridColumn: '1', gridRow: '1' }}>
          <Placeholder label="Geospatial Map — coming Hour 8" />
        </div>

        {/* Metrics — Hour 9 */}
        <div style={{ gridColumn: '2', gridRow: '1 / span 2' }}>
          <Placeholder label="Live Metrics — coming Hour 9" />
        </div>

        {/* Live complaint feed — Hour 7 ✓ */}
        <div style={{ gridColumn: '1', gridRow: '2', minHeight: 0 }}>
          <ComplaintFeed />
        </div>
      </div>
    </Layout>
  )
}
