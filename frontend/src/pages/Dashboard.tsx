import { useEffect } from 'react'
import Layout from '../components/layout/Layout'
import DrishtiMap from '../components/map/DrishtiMap'
import AnalyticsPanel from '../components/analytics/AnalyticsPanel'
import ComplaintFeed from '../components/complaints/ComplaintFeed'
import NLQueryChat from '../components/ai/NLQueryChat'
import { useComplaints } from '../hooks/useComplaints'
import { useTowers } from '../hooks/useTowers'
import { useAlerts } from '../hooks/useAlerts'
import { useAuthStore } from '../stores/authStore'
import { connectSocket } from '../services/socket'

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
      <div className="h-full flex flex-col p-3 gap-3">
        {/* Main grid */}
        <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: '1fr 340px', gridTemplateRows: '1fr 1fr', minHeight: 0 }}>
          {/* Map — Hour 8 ✓ */}
          <div style={{ gridColumn: '1', gridRow: '1', minHeight: 0 }}>
            <DrishtiMap />
          </div>

          {/* Metrics — Hour 9 ✓ */}
          <div style={{ gridColumn: '2', gridRow: '1 / span 2', minHeight: 0 }}>
            <AnalyticsPanel />
          </div>

          {/* Live complaint feed — Hour 7 ✓ */}
          <div style={{ gridColumn: '1', gridRow: '2', minHeight: 0 }}>
            <ComplaintFeed />
          </div>
        </div>

        {/* NL Query chat — Hour 10 ✓ */}
        <div style={{ height: 240, minHeight: 0 }}>
          <NLQueryChat />
        </div>
      </div>
    </Layout>
  )
}
