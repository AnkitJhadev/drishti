export type AlertSeverity = 'info' | 'warning' | 'critical'

export type AlertType =
  | 'new_cluster'
  | 'tower_degraded'
  | 'spike_detected'
  | 'recommendation_ready'
  | 'approval_pending'

export interface Alert {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  tower_id?: string
  cluster_id?: string
  read: boolean
  action_required: boolean
  created_at: string
}
