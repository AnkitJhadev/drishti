import { useEffect, useState } from 'react'
import Layout from '../components/layout/Layout'
import DrishtiMap from '../components/map/DrishtiMap'
import AnalyticsPanel from '../components/analytics/AnalyticsPanel'
import ComplaintFeed from '../components/complaints/ComplaintFeed'
import NLQueryChat from '../components/ai/NLQueryChat'
import ApprovalPanel from '../components/approval/ApprovalPanel'
import { useComplaints } from '../hooks/useComplaints'
import { useTowers } from '../hooks/useTowers'
import { useAlerts } from '../hooks/useAlerts'
import { useRecommendations } from '../hooks/useRecommendations'
import { useAuthStore } from '../stores/authStore'
import { useAIChatStore } from '../stores/aiChatStore'
import { connectSocket } from '../services/socket'

export default function Dashboard() {
  const token = useAuthStore((s) => s.token)
  const recommendations = useAIChatStore((s) => s.recommendations)
  const pendingCount = recommendations.filter((r) => r.status === 'pending').length
  const [approvalOpen, setApprovalOpen] = useState(false)

  // Load initial data
  useComplaints()
  useTowers()
  useAlerts()
  useRecommendations()

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

      {/* Floating Approvals button */}
      <button
        onClick={() => setApprovalOpen(true)}
        className="fixed z-[1400] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg transition-transform hover:scale-105"
        style={{ bottom: 20, right: 20, background: '#f59e0b', color: '#0a0f1e' }}
      >
        <span>⚖ Approvals</span>
        {pendingCount > 0 && (
          <span
            className="text-xs px-1.5 rounded-full font-bold"
            style={{ background: '#0a0f1e', color: '#f59e0b' }}
          >
            {pendingCount}
          </span>
        )}
      </button>

      {/* Approval drawer — Hour 11 ✓ */}
      <ApprovalPanel open={approvalOpen} onClose={() => setApprovalOpen(false)} />
    </Layout>
  )
}
