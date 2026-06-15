export type ComplaintSource = 'email' | 'pdf' | 'image' | 'sms' | 'csv' | 'json'

export type IssueType =
  | 'network_outage'
  | 'call_drop'
  | 'slow_internet'
  | 'tower_failure'
  | 'billing_issue'
  | 'unknown'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export type ComplaintStatus =
  | 'pending'
  | 'processing'
  | 'clustered'
  | 'recommended'
  | 'approved'
  | 'rejected'
  | 'resolved'
  | 'failed'       // classification couldn't complete (e.g. AI quota exhausted)

export interface ComplaintRecord {
  id: string
  source: ComplaintSource
  raw_text: string
  location_hint: string
  timestamp: string
  sender: string
  status: ComplaintStatus
  media_url?: string
}

export interface EnrichedComplaint extends ComplaintRecord {
  issue_type: IssueType
  severity: Severity
  coordinates: [number, number]
  cluster_id?: string
  tower_id?: string
  confidence: number
  error?: string   // human-readable reason when status === 'failed'
}
