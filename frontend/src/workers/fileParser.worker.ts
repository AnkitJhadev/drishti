/// <reference lib="webworker" />
// Parses complaint files OFF the main thread (CSV / JSON / PDF) and reports
// progress. Heavy parsing never blocks the UI. Output records are validated
// again server-side, so this worker is purely a performance/UX optimization.
import Papa from 'papaparse'

export interface ParsedRecord {
  source: 'csv' | 'json' | 'pdf'
  text: string
  location?: string
  sender?: string
  timestamp?: string
}

type InMsg = { id: number; fileName: string; kind: 'csv' | 'json' | 'pdf'; buffer: ArrayBuffer }
type OutMsg =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'done'; records: ParsedRecord[] }
  | { id: number; type: 'error'; message: string }

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m)

function parseCsv(text: string): ParsedRecord[] {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  })
  return res.data
    .map((row) => ({
      source: 'csv' as const,
      text: (row['complaint'] ?? row['message'] ?? row['text'] ?? '').trim(),
      location: (row['location'] ?? row['area'] ?? row['city'] ?? '').trim() || undefined,
      sender: (row['phone'] ?? row['sender'] ?? row['mobile'] ?? '').trim() || undefined,
      timestamp: (row['timestamp'] ?? row['date'] ?? row['time'] ?? '').trim() || undefined,
    }))
    .filter((r) => r.text.length > 0)
}

function parseJson(text: string): ParsedRecord[] {
  const data = JSON.parse(text)
  const arr = Array.isArray(data) ? data : Array.isArray(data?.complaints) ? data.complaints : []
  return arr
    .map((row: Record<string, unknown>) => ({
      source: 'json' as const,
      text: String(row.complaint ?? row.text ?? row.message ?? '').trim(),
      location: row.location ? String(row.location).trim() : undefined,
      sender: row.phone ? String(row.phone).trim() : row.sender ? String(row.sender).trim() : undefined,
      timestamp: row.timestamp ? String(row.timestamp).trim() : undefined,
    }))
    .filter((r: ParsedRecord) => r.text.length > 0)
}

async function parsePdf(buffer: ArrayBuffer): Promise<ParsedRecord[]> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  const full = (Array.isArray(text) ? text.join(' ') : String(text)).replace(/\s+/g, ' ').trim()
  const loc = full.match(/(?:location|service area)\s*:\s*([^.\n]+?)(?:\s{2,}|\.|$)/i)?.[1]?.trim()
  const sender = full.match(/mobile\s*:\s*([0-9+\-\s]+)/i)?.[1]?.trim()
  return full.length > 0 ? [{ source: 'pdf', text: full, location: loc, sender }] : []
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, kind, buffer } = e.data
  try {
    post({ id, type: 'progress', value: 0.2 })
    let records: ParsedRecord[]
    if (kind === 'pdf') {
      records = await parsePdf(buffer)
    } else {
      const text = new TextDecoder().decode(buffer)
      post({ id, type: 'progress', value: 0.5 })
      records = kind === 'json' ? parseJson(text) : parseCsv(text)
    }
    post({ id, type: 'progress', value: 1 })
    post({ id, type: 'done', records })
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
