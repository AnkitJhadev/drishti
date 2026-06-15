import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { parseStructuredPdf, PdfFormatError } from '../parsers/pdfParser'
import { parseCsv, CsvFormatError } from '../parsers/csvParser'
import { parseJson, JsonFormatError } from '../parsers/jsonParser'
import { geocodeLocation, isGeocodable } from '../utils/geocoder'
import { query } from '../db/postgres'
import { addIngestJob } from '../queue/jobs/ingestJob'
import { emitComplaintNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { ComplaintSource } from '../types/complaint'

const router = Router()

// ── Accepted input: structured CSV, PDF and JSON complaint reports ────────
const upload = multer({
  storage: multer.memoryStorage(),
  // Memory storage: each in-flight upload is held in RAM, so the cap doubles
  // as an OOM guard on a small host. Sample complaint reports are well under this.
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase()
    const isPdf = file.mimetype === 'application/pdf' || name.endsWith('.pdf')
    // Browsers often send text/plain for .csv, so also match by extension.
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.csv')
    const isJson = file.mimetype === 'application/json' || name.endsWith('.json')
    cb(null, isPdf || isCsv || isJson)
  },
})

interface ExtractedRecord {
  text: string
  sender?: string
  locationHint?: string
  timestamp?: string
}

interface Rejection {
  file: string
  reason: string
}

type FileSource = 'pdf' | 'csv' | 'json'

function detectSource(mimetype: string, originalname: string): FileSource {
  const name = originalname.toLowerCase()
  if (mimetype === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mimetype === 'application/json' || name.endsWith('.json')) return 'json'
  return 'csv'
}

// ── Parse + validate one file into insertable records + rejection reasons ──
async function extractRecords(
  file: Express.Multer.File,
  source: FileSource
): Promise<{ records: ExtractedRecord[]; rejections: Rejection[] }> {
  const rejections: Rejection[] = []

  if (source === 'pdf') {
    const { text, locationHint, sender } = await parseStructuredPdf(file.buffer)
    return { records: [{ text, locationHint, sender }], rejections }
  }

  // CSV or JSON — both yield validated { text, location, sender, timestamp } rows.
  const { rows, rejected } = source === 'json' ? parseJson(file.buffer) : parseCsv(file.buffer)
  for (const r of rejected) {
    rejections.push({ file: file.originalname, reason: `row ${r.row}: ${r.reason}` })
  }
  const records = rows.map((r) => ({
    text: r.text,
    sender: r.sender,
    locationHint: r.location,
    timestamp: r.timestamp,
  }))
  return { records, rejections }
}

// ── POST /ingest ──────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No valid files uploaded. Only structured .csv, .pdf and .json complaint reports are accepted.' })
      return
    }

    const inserted: string[] = []
    const rejections: Rejection[] = []

    for (const file of files) {
      const source = detectSource(file.mimetype, file.originalname)

      let records: ExtractedRecord[]
      try {
        const result = await extractRecords(file, source)
        records = result.records
        rejections.push(...result.rejections)
      } catch (parseErr) {
        // Format errors are expected (bad structure) — report them clearly.
        const reason =
          parseErr instanceof CsvFormatError ||
          parseErr instanceof PdfFormatError ||
          parseErr instanceof JsonFormatError
            ? parseErr.message
            : `could not parse file (${String(parseErr)})`
        logger.warn(`Rejected ${file.originalname}: ${reason}`)
        rejections.push({ file: file.originalname, reason })
        continue
      }

      for (const record of records) {
        if (!record.text || record.text.length < 5) {
          rejections.push({ file: file.originalname, reason: 'complaint text too short' })
          continue
        }

        const coords = geocodeLocation(record.locationHint ?? record.text)
        const sourceCol: ComplaintSource = source

        const rows = await query<{ id: string }>(
          `INSERT INTO complaints
             (source, raw_text, location_hint, lat, lng, sender, timestamp, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
           RETURNING id`,
          [
            sourceCol,
            record.text,
            record.locationHint ?? null,
            coords?.[0] ?? null,
            coords?.[1] ?? null,
            record.sender ?? null,
            record.timestamp ?? new Date().toISOString(),
          ]
        )

        const id = rows[0]?.id
        if (id) {
          inserted.push(id)
          await addIngestJob({ complaintId: id, rawText: record.text, source: sourceCol })
          logger.info(`Complaint ingested + job queued — id: ${id}, source: ${source}`)

          emitComplaintNew({
            id,
            source: sourceCol,
            raw_text: record.text,
            location_hint: record.locationHint ?? '',
            timestamp: record.timestamp ?? new Date().toISOString(),
            sender: record.sender ?? 'unknown',
            status: 'pending',
            issue_type: 'unknown',
            severity: 'low',
            coordinates: [coords?.[0] ?? 0, coords?.[1] ?? 0],
            confidence: 0,
          })
        }
      }
    }

    const parts = [`${inserted.length} complaint(s) ingested`]
    if (rejections.length > 0) parts.push(`${rejections.length} rejected`)

    res.status(inserted.length > 0 ? 201 : 400).json({
      message: parts.join(', '),
      ids: inserted,
      rejected: rejections,
    })
  } catch (err) {
    logger.error(`Ingest error: ${String(err)}`)
    res.status(500).json({ error: 'Ingest failed' })
  }
})

// ── POST /ingest/records ────────────────────────────────────────────────
// Accepts records already parsed client-side (Web Worker). The backend STILL
// validates every record (text length + geocodable location) — client input
// is never trusted. Same insert/queue/emit path as the file endpoint.
interface IncomingRecord {
  source?: string
  text?: string
  location?: string
  sender?: string
  timestamp?: string
}

router.post('/records', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { records?: IncomingRecord[] }
    const records = Array.isArray(body.records) ? body.records : []

    if (records.length === 0) {
      res.status(400).json({ error: 'No records provided' })
      return
    }

    const inserted: string[] = []
    const rejections: Rejection[] = []

    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      const label = `record ${i + 1}`
      const text = (r.text ?? '').trim()
      const location = (r.location ?? '').trim()
      const source: ComplaintSource =
        r.source === 'pdf' || r.source === 'json' || r.source === 'csv' ? r.source : 'csv'

      if (text.length < 5) {
        rejections.push({ file: label, reason: 'complaint text too short' })
        continue
      }
      if (location && !isGeocodable(location)) {
        rejections.push({ file: label, reason: `unknown location "${location}"` })
        continue
      }

      const coords = geocodeLocation(location || text)

      const rows = await query<{ id: string }>(
        `INSERT INTO complaints
           (source, raw_text, location_hint, lat, lng, sender, timestamp, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING id`,
        [
          source,
          text,
          location || null,
          coords?.[0] ?? null,
          coords?.[1] ?? null,
          r.sender ?? null,
          r.timestamp ?? new Date().toISOString(),
        ]
      )

      const id = rows[0]?.id
      if (id) {
        inserted.push(id)
        await addIngestJob({ complaintId: id, rawText: text, source })
        emitComplaintNew({
          id,
          source,
          raw_text: text,
          location_hint: location || '',
          timestamp: r.timestamp ?? new Date().toISOString(),
          sender: r.sender ?? 'unknown',
          status: 'pending',
          issue_type: 'unknown',
          severity: 'low',
          coordinates: [coords?.[0] ?? 0, coords?.[1] ?? 0],
          confidence: 0,
        })
      }
    }

    logger.info(`Ingested ${inserted.length} client-parsed record(s), ${rejections.length} rejected`)
    const parts = [`${inserted.length} complaint(s) ingested`]
    if (rejections.length > 0) parts.push(`${rejections.length} rejected`)

    res.status(inserted.length > 0 ? 201 : 400).json({
      message: parts.join(', '),
      ids: inserted,
      rejected: rejections,
    })
  } catch (err) {
    logger.error(`Ingest records error: ${String(err)}`)
    res.status(500).json({ error: 'Ingest failed' })
  }
})

export default router
