import { useEffect, useState } from 'react'
import Layout from '../components/layout/Layout'
import DrishtiMap from '../components/map/DrishtiMap'
import StatsBar from '../components/analytics/StatsBar'
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
      <div className="p-3 space-y-3" style={{ paddingBottom: 88 }}>
        {/* KPI strip */}
        <StatsBar />

        {/* Map — full width, tall, expandable (Hour 8) */}
        <div id="section-towers" style={{ scrollMarginTop: 12 }}>
          <DrishtiMap />
        </div>

        {/* Feed + Metrics side by side (Hours 7 & 9) */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div id="section-complaints" style={{ height: 400, scrollMarginTop: 12 }}>
            <ComplaintFeed />
          </div>
          <div id="section-analytics" style={{ height: 400, scrollMarginTop: 12 }}>
            <AnalyticsPanel />
          </div>
        </div>

        {/* NL Query chat (Hour 10) */}
        <div style={{ height: 320 }}>
          <NLQueryChat />
        </div>
      </div>

      {/* Floating Approvals button */}
      <button
        onClick={() => setApprovalOpen(true)}
        className="dr-btn-accent fixed z-[1400] flex items-center gap-2 px-4 py-2.5 text-sm"
        style={{ bottom: 20, right: 20, borderRadius: 999 }}
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
