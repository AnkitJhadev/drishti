import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { parseStructuredPdf, PdfFormatError } from '../parsers/pdfParser'
import { parseCsv, CsvFormatError } from '../parsers/csvParser'
import { geocodeLocation } from '../utils/geocoder'
import { query } from '../db/postgres'
import { addIngestJob } from '../queue/jobs/ingestJob'
import { emitComplaintNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { ComplaintSource } from '../types/complaint'

const router = Router()

// ── Accepted input: structured CSV and PDF complaint reports only ─────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')
    // Browsers often send text/plain for .csv, so also match by extension.
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv')
    cb(null, isPdf || isCsv)
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

function detectSource(mimetype: string, originalname: string): 'pdf' | 'csv' {
  if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) return 'pdf'
  return 'csv'
}

// ── Parse + validate one file into insertable records + rejection reasons ──
async function extractRecords(
  file: Express.Multer.File,
  source: 'pdf' | 'csv'
): Promise<{ records: ExtractedRecord[]; rejections: Rejection[] }> {
  const rejections: Rejection[] = []

  if (source === 'pdf') {
    const { text, locationHint, sender } = await parseStructuredPdf(file.buffer)
    return { records: [{ text, locationHint, sender }], rejections }
  }

  // CSV
  const { rows, rejected } = parseCsv(file.buffer)
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
      res.status(400).json({ error: 'No valid files uploaded. Only structured .csv and .pdf complaint reports are accepted.' })
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
          parseErr instanceof CsvFormatError || parseErr instanceof PdfFormatError
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

export default router
