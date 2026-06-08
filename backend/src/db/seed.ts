import { query } from './postgres'
import { logger } from '../utils/logger'

// 20 towers spread across India:
// Delhi (3), Mumbai (3), Bengaluru (3), Chennai (2),
// Kolkata (2), Hyderabad (2), Pune (2), Ahmedabad (2), Jaipur (1)
// All towers seed as fully operational with zero affected users.
// Tower health is DERIVED — a tower only turns degraded/critical/offline
// once real complaints are ingested and the Pattern Agent correlates them.
const TOWERS = [
  // ── Delhi ────────────────────────────────────────────────
  { id: 'T-101', name: 'Delhi Central Tower',      lat: 28.6139, lng: 77.2090, status: 'operational', coverage_radius_km: 3.0, affected_users: 0 },
  { id: 'T-102', name: 'Delhi North Sector',       lat: 28.7041, lng: 77.1025, status: 'operational', coverage_radius_km: 2.5, affected_users: 0 },
  { id: 'T-103', name: 'Delhi South Hub',          lat: 28.5355, lng: 77.3910, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Mumbai ───────────────────────────────────────────────
  { id: 'T-104', name: 'Mumbai Andheri Tower',     lat: 19.1136, lng: 72.8697, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-105', name: 'Mumbai Bandra Hub',        lat: 19.0596, lng: 72.8295, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-106', name: 'Mumbai Navi Tower',        lat: 19.0330, lng: 73.0297, status: 'operational', coverage_radius_km: 2.5, affected_users: 0 },

  // ── Bengaluru ────────────────────────────────────────────
  { id: 'T-107', name: 'Bengaluru MG Road Tower',  lat: 12.9716, lng: 77.5946, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-108', name: 'Bengaluru Whitefield Hub', lat: 12.9698, lng: 77.7499, status: 'operational', coverage_radius_km: 3.0, affected_users: 0 },
  { id: 'T-109', name: 'Bengaluru Electronic City',lat: 12.8399, lng: 77.6770, status: 'operational', coverage_radius_km: 2.5, affected_users: 0 },

  // ── Chennai ──────────────────────────────────────────────
  { id: 'T-110', name: 'Chennai Anna Nagar Tower', lat: 13.0827, lng: 80.2707, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-111', name: 'Chennai OMR Hub',          lat: 12.9010, lng: 80.2279, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Kolkata ──────────────────────────────────────────────
  { id: 'T-112', name: 'Kolkata Salt Lake Tower',  lat: 22.5726, lng: 88.3639, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-113', name: 'Kolkata Howrah Hub',       lat: 22.5958, lng: 88.2636, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Hyderabad ────────────────────────────────────────────
  { id: 'T-114', name: 'Hyderabad HITEC City',     lat: 17.4435, lng: 78.3772, status: 'operational', coverage_radius_km: 2.5, affected_users: 0 },
  { id: 'T-115', name: 'Hyderabad Old City Tower', lat: 17.3616, lng: 78.4747, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Pune ─────────────────────────────────────────────────
  { id: 'T-116', name: 'Pune Hinjewadi Tower',     lat: 18.5912, lng: 73.7380, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
  { id: 'T-117', name: 'Pune Kothrud Hub',         lat: 18.5074, lng: 73.8077, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Ahmedabad ────────────────────────────────────────────
  { id: 'T-118', name: 'Ahmedabad SG Road Tower',  lat: 23.0225, lng: 72.5714, status: 'operational', coverage_radius_km: 2.5, affected_users: 0 },
  { id: 'T-119', name: 'Ahmedabad Maninagar Hub',  lat: 22.9962, lng: 72.6054, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },

  // ── Jaipur ───────────────────────────────────────────────
  { id: 'T-120', name: 'Jaipur Vaishali Tower',    lat: 26.9124, lng: 75.7873, status: 'operational', coverage_radius_km: 2.0, affected_users: 0 },
] as const

export async function seedTowers(): Promise<void> {
  // Check if towers already exist — idempotent seed
  const existing = await query<{ count: string }>('SELECT COUNT(*) as count FROM towers')
  if (parseInt(existing[0].count, 10) > 0) {
    logger.info(`Towers already seeded (${existing[0].count} found). Skipping.`)
    return
  }

  logger.info('Seeding 20 mock towers across India...')

  for (const tower of TOWERS) {
    const activeComplaints = tower.affected_users > 0
      ? Math.floor(tower.affected_users / 300)
      : 0

    await query(
      `INSERT INTO towers
        (id, name, lat, lng, status, coverage_radius_km, active_complaints, affected_users)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        tower.id,
        tower.name,
        tower.lat,
        tower.lng,
        tower.status,
        tower.coverage_radius_km,
        activeComplaints,
        tower.affected_users,
      ]
    )
  }

  logger.info('Tower seed complete. 20 towers inserted.')
}
