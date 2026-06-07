// Converts a location hint string into [lat, lng] coordinates.
// Uses a static lookup for known Indian cities/areas first (fast, free).
// Falls back to null if the location can't be resolved.

interface CityCoord {
  lat: number
  lng: number
}

const CITY_MAP: Record<string, CityCoord> = {
  // Delhi
  delhi: { lat: 28.6139, lng: 77.2090 },
  'new delhi': { lat: 28.6139, lng: 77.2090 },
  'delhi north': { lat: 28.7041, lng: 77.1025 },
  'delhi south': { lat: 28.5355, lng: 77.3910 },

  // Mumbai
  mumbai: { lat: 19.0760, lng: 72.8777 },
  andheri: { lat: 19.1136, lng: 72.8697 },
  bandra: { lat: 19.0596, lng: 72.8295 },
  'navi mumbai': { lat: 19.0330, lng: 73.0297 },

  // Bengaluru
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  'mg road': { lat: 12.9716, lng: 77.5946 },
  whitefield: { lat: 12.9698, lng: 77.7499 },
  'electronic city': { lat: 12.8399, lng: 77.6770 },

  // Chennai
  chennai: { lat: 13.0827, lng: 80.2707 },
  'anna nagar': { lat: 13.0827, lng: 80.2707 },
  omr: { lat: 12.9010, lng: 80.2279 },

  // Kolkata
  kolkata: { lat: 22.5726, lng: 88.3639 },
  'salt lake': { lat: 22.5726, lng: 88.3639 },
  howrah: { lat: 22.5958, lng: 88.2636 },

  // Hyderabad
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  'hitec city': { lat: 17.4435, lng: 78.3772 },
  'old city': { lat: 17.3616, lng: 78.4747 },

  // Pune
  pune: { lat: 18.5204, lng: 73.8567 },
  hinjewadi: { lat: 18.5912, lng: 73.7380 },
  kothrud: { lat: 18.5074, lng: 73.8077 },

  // Ahmedabad
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  'sg road': { lat: 23.0225, lng: 72.5714 },
  maninagar: { lat: 22.9962, lng: 72.6054 },

  // Jaipur
  jaipur: { lat: 26.9124, lng: 75.7873 },
}

export function geocodeLocation(locationHint: string): [number, number] | null {
  if (!locationHint) return null

  const lower = locationHint.toLowerCase()

  // Try longest match first (e.g. "navi mumbai" before "mumbai")
  const keys = Object.keys(CITY_MAP).sort((a, b) => b.length - a.length)

  for (const key of keys) {
    if (lower.includes(key)) {
      const coord = CITY_MAP[key]
      // Add small jitter (±0.01°) so multiple complaints don't stack exactly
      return [
        coord.lat + (Math.random() - 0.5) * 0.02,
        coord.lng + (Math.random() - 0.5) * 0.02,
      ]
    }
  }

  return null
}
