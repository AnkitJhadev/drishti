import Papa from 'papaparse'
import { logger } from '../utils/logger'

export interface CsvRow {
  text: string          // the raw complaint text
  sender?: string       // phone number or customer ID
  location?: string     // area/city hint
  timestamp?: string    // original complaint time
}

export function parseCsv(buffer: Buffer): CsvRow[] {
  const content = buffer.toString('utf-8')

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  })

  if (result.errors.length > 0) {
    logger.warn(`CSV parse warnings: ${result.errors.map((e) => e.message).join(', ')}`)
  }

  const rows = result.data.map((row): CsvRow => {
    // Accept common column name variations
    const text =
      row['complaint'] ??
      row['message'] ??
      row['text'] ??
      row['description'] ??
      Object.values(row)[0] ??
      ''

    return {
      text: text.trim(),
      sender: row['phone'] ?? row['sender'] ?? row['customer_id'] ?? row['mobile'],
      location: row['location'] ?? row['area'] ?? row['city'] ?? row['address'],
      timestamp: row['timestamp'] ?? row['date'] ?? row['time'],
    }
  }).filter((r) => r.text.length > 0)

  logger.debug(`CSV parsed — ${rows.length} complaint rows`)
  return rows
}
