import { isGeocodable } from '../utils/geocoder'
import { logger } from '../utils/logger'
import type { CsvRow, RejectedRow, CsvParseResult } from './csvParser'

// ── Fixed, required JSON structure ────────────────────────────────────────
// Either a top-level array, or { "complaints": [ ... ] }. Each item:
//   { "complaint": "<text>", "location": "<known city/area>", "phone"?: "...", "timestamp"?: "..." }
export class JsonFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JsonFormatError'
  }
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v.trim() : String(v).trim()
}

export function parseJson(buffer: Buffer): CsvParseResult {
  let data: unknown
  try {
    data = JSON.parse(buffer.toString('utf-8'))
  } catch {
    throw new JsonFormatError('File is not valid JSON.')
  }

  // Accept a bare array, or an object with a "complaints" array.
  let arr: unknown[]
  if (Array.isArray(data)) {
    arr = data
  } else if (data && typeof data === 'object' && Array.isArray((data as { complaints?: unknown }).complaints)) {
    arr = (data as { complaints: unknown[] }).complaints
  } else {
    throw new JsonFormatError(
      'Expected a JSON array of complaints (or { "complaints": [...] }). ' +
        'Each item needs "complaint" and "location".'
    )
  }

  const rows: CsvRow[] = []
  const rejected: RejectedRow[] = []

  arr.forEach((raw, i) => {
    const rowNum = i + 1
    if (!raw || typeof raw !== 'object') {
      rejected.push({ row: rowNum, reason: 'item is not an object' })
      return
    }
    const item = raw as Record<string, unknown>
    const text = asString(item.complaint)
    const location = asString(item.location)

    if (!text) {
      rejected.push({ row: rowNum, reason: 'missing "complaint"' })
      return
    }
    if (!location) {
      rejected.push({ row: rowNum, reason: 'missing "location"' })
      return
    }
    if (!isGeocodable(location)) {
      rejected.push({ row: rowNum, reason: `unknown location "${location}" (not a recognised city/area)` })
      return
    }

    rows.push({
      text,
      location,
      sender: asString(item.phone ?? item.sender ?? item.mobile) || undefined,
      timestamp: asString(item.timestamp ?? item.date ?? item.time) || undefined,
    })
  })

  logger.debug(`JSON parsed — ${rows.length} valid, ${rejected.length} rejected`)
  return { rows, rejected }
}
