import type { Tower } from '../../types/tower'

// Haversine distance in km
function distKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export interface SimResult {
  steps: { step: number; impacted: number; rerouted: number }[]
  directUsers: number
  neighbors: { id: string; name: string; extraLoad: number; overloaded: boolean }[]
  totalImpacted: number
}

// Estimate average users a healthy tower serves, for overload thresholds.
const NOMINAL_CAPACITY = 4000

// Simulate a tower failing: its users try to reroute to nearby towers
// (within ~2x coverage radius). Nearby towers may overload.
export function simulateFailure(target: Tower, all: Tower[], steps = 8): SimResult {
  const directUsers = target.affected_users > 0 ? target.affected_users : 2500

  const neighbors = all
    .filter((t) => t.id !== target.id && t.status !== 'offline')
    .map((t) => ({ tower: t, d: distKm(target.coordinates, t.coordinates) }))
    .filter((n) => n.d <= target.coverage_radius_km * 4)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)

  // Distribute the failed tower's users across neighbors, weighted by proximity
  const totalWeight = neighbors.reduce((s, n) => s + 1 / (n.d + 0.5), 0) || 1
  const neighborImpact = neighbors.map((n) => {
    const share = (1 / (n.d + 0.5)) / totalWeight
    const extraLoad = Math.round(directUsers * share)
    const projected = (n.tower.affected_users || 1000) + extraLoad
    return { id: n.tower.id, name: n.tower.name, extraLoad, overloaded: projected > NOMINAL_CAPACITY }
  })

  // Impact ramps up over time as the outage propagates / users notice
  const rerouteCapable = neighbors.length > 0
  const stepData = Array.from({ length: steps }, (_, i) => {
    const progress = (i + 1) / steps
    const impacted = Math.round(directUsers * progress)
    const rerouted = rerouteCapable ? Math.round(impacted * 0.55 * progress) : 0
    return { step: i + 1, impacted, rerouted }
  })

  return {
    steps: stepData,
    directUsers,
    neighbors: neighborImpact,
    totalImpacted: directUsers,
  }
}
