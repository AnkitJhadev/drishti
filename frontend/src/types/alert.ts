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
  created_at: string
  read: boolean
  tower_id?: string
  cluster_id?: string
  action_required: boolean
}
