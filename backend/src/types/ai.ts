export interface ComplaintCluster {
  id: string
  issue_type: string
  complaint_ids: string[]
  size: number
  center_coordinates: [number, number]
  radius_km: number
  tower_id?: string
  created_at: string
}

export interface AIRecommendation {
  id: string
  cluster_id: string
  tower_id: string
  root_cause: string
  suggested_action: string
  affected_users: number
  priority: string
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
  operator_note?: string
  created_at: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  operator_id: string
  role: ChatRole
  content: string
  map_highlights?: string[]
  chart_data?: Record<string, number>
  created_at: string
}
