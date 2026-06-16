import { useEffect, useState, lazy, Suspense } from 'react'
import Layout from '../components/layout/Layout'
import DrishtiMap from '../components/map/DrishtiMap'
import StatsBar from '../components/analytics/StatsBar'
import ComplaintFeed from '../components/complaints/ComplaintFeed'
import NLQueryChat from '../components/ai/NLQueryChat'
import ApprovalPanel from '../components/approval/ApprovalPanel'
import DashboardTour from '../components/tour/DashboardTour'

// Defer the heavy charts (recharts) chunk so map + feed paint first.
const AnalyticsPanel = lazy(() => import('../components/analytics/AnalyticsPanel'))

function PanelSkeleton() {
  return <div className="dr-skeleton h-full w-full rounded-lg" />
}
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
        <div id="section-towers" data-tour="map" style={{ scrollMarginTop: 12 }}>
          <DrishtiMap />
        </div>

        {/* Feed + Metrics side by side (Hours 7 & 9) */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div id="section-complaints" style={{ height: 400, scrollMarginTop: 12 }}>
            <ComplaintFeed />
          </div>
          <div id="section-analytics" style={{ height: 400, scrollMarginTop: 12 }}>
            <Suspense fallback={<PanelSkeleton />}>
              <AnalyticsPanel />
            </Suspense>
          </div>
        </div>

        {/* NL Query chat (Hour 10) */}
        <div data-tour="chat" style={{ height: 320 }}>
          <NLQueryChat />
        </div>
      </div>

      {/* Floating Approvals button */}
      <button
        data-tour="approvals"
        onClick={() => setApprovalOpen(true)}
        aria-label={`Open approvals${pendingCount > 0 ? `, ${pendingCount} pending` : ''}`}
        className="dr-btn-accent fixed z-[1400] flex items-center gap-2 px-4 py-2.5 text-sm shadow-lg transition-transform hover:-translate-y-0.5"
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

      {/* First-run guided tour */}
      <DashboardTour />
    </Layout>
  )
}
