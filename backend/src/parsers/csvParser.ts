import Papa from 'papaparse'
import { isGeocodable } from '../utils/geocoder'
import { logger } from '../utils/logger'

export interface CsvRow {
  text: string          // the raw complaint text
  sender?: string       // phone number or customer ID
  location?: string     // area/city hint (must be a known location)
  timestamp?: string    // original complaint time
}

export interface RejectedRow {
  row: number           // 1-based row number (excluding header)
  reason: string
}

export interface CsvParseResult {
  rows: CsvRow[]
  rejected: RejectedRow[]
}

// ── Fixed, required CSV structure ─────────────────────────────────────────
// The file MUST have a header row containing at least these columns:
//   complaint  — the complaint text          (REQUIRED)
//   location   — a known city/area           (REQUIRED)
//   phone      — customer phone / id         (optional)
//   timestamp  — original complaint time     (optional)
export const REQUIRED_CSV_HEADERS = ['complaint', 'location'] as const

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvFormatError'
  }
}

export function parseCsv(buffer: Buffer): CsvParseResult {
  const content = buffer.toString('utf-8')

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  })

  const headers = (result.meta.fields ?? []).map((h) => h.toLowerCase().trim())

  // ── Enforce the required structure ──────────────────────────────────────
  const missing = REQUIRED_CSV_HEADERS.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    throw new CsvFormatError(
      `CSV is missing required column(s): ${missing.join(', ')}. ` +
        `Expected header row "complaint,location,phone". Found "${headers.join(',') || '(none)'}".`
    )
  }

  if (result.errors.length > 0) {
    logger.warn(`CSV parse warnings: ${result.errors.map((e) => e.message).join(', ')}`)
  }

  const rows: CsvRow[] = []
  const rejected: RejectedRow[] = []

  result.data.forEach((row, i) => {
    const rowNum = i + 1
    const text = (row['complaint'] ?? '').trim()
    const location = (row['location'] ?? '').trim()

    if (!text) {
      rejected.push({ row: rowNum, reason: 'empty "complaint" text' })
      return
    }
    if (!location) {
      rejected.push({ row: rowNum, reason: 'empty "location"' })
      return
    }
    if (!isGeocodable(location)) {
      rejected.push({ row: rowNum, reason: `unknown location "${location}" (not a recognised city/area)` })
      return
    }

    rows.push({
      text,
      location,
      sender: (row['phone'] ?? row['sender'] ?? row['mobile'] ?? '').trim() || undefined,
      timestamp: (row['timestamp'] ?? row['date'] ?? row['time'] ?? '').trim() || undefined,
    })
  })

  logger.debug(`CSV parsed — ${rows.length} valid rows, ${rejected.length} rejected`)
  return { rows, rejected }
}
