import { describe, it, expect } from 'vitest'
import { geocodeLocation, isGeocodable, KNOWN_LOCATIONS } from './geocoder'

describe('geocoder', () => {
  describe('isGeocodable', () => {
    it('accepts a known city', () => {
      expect(isGeocodable('Bandra Mumbai')).toBe(true)
      expect(isGeocodable('Whitefield Bengaluru')).toBe(true)
      expect(isGeocodable('Jaipur')).toBe(true)
    })

    it('is case-insensitive and matches as a substring', () => {
      expect(isGeocodable('complaint from ANDHERI east')).toBe(true)
    })

    it('rejects unknown locations', () => {
      expect(isGeocodable('Goa')).toBe(false)
      expect(isGeocodable('Lucknow')).toBe(false)
    })

    it('rejects empty / nullish input', () => {
      expect(isGeocodable('')).toBe(false)
      expect(isGeocodable(undefined)).toBe(false)
      expect(isGeocodable(null)).toBe(false)
    })
  })

  describe('geocodeLocation', () => {
    it('returns coordinates within India for a known city', () => {
      const coords = geocodeLocation('Bandra Mumbai')
      expect(coords).not.toBeNull()
      const [lat, lng] = coords as [number, number]
      expect(lat).toBeGreaterThan(6)
      expect(lat).toBeLessThan(38)
      expect(lng).toBeGreaterThan(68)
      expect(lng).toBeLessThan(98)
    })

    it('returns null for an unknown location', () => {
      expect(geocodeLocation('Atlantis')).toBeNull()
    })

    it('prefers the longest matching key (navi mumbai over mumbai)', () => {
      const navi = geocodeLocation('Navi Mumbai') as [number, number]
      const mumbai = geocodeLocation('Mumbai') as [number, number]
      // different base coordinates → should not collapse to the same city
      expect(Math.abs(navi[1] - mumbai[1])).toBeGreaterThan(0.05)
    })
  })

  it('KNOWN_LOCATIONS is non-empty and lowercase', () => {
    expect(KNOWN_LOCATIONS.length).toBeGreaterThan(0)
    for (const k of KNOWN_LOCATIONS) expect(k).toBe(k.toLowerCase())
  })
})
