export type TowerStatus = 'operational' | 'degraded' | 'critical' | 'offline'

export type TowerIssueType =
  | 'power_failure'
  | 'hardware_fault'
  | 'overload'
  | 'maintenance'
  | 'unknown'

export interface Tower {
  id: string
  name: string
  coordinates: [number, number]
  status: TowerStatus
  active_complaints: number
  affected_users: number
  last_checked: string
  coverage_radius_km: number
}

export interface TowerDetail extends Tower {
  issue_type?: TowerIssueType
  recommendation?: string
  cluster_ids: string[]
}
