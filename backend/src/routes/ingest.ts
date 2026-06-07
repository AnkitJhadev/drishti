import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth'
import { parsePdf } from '../parsers/pdfParser'
import { parseCsv } from '../parsers/csvParser'
import { parseImage } from '../parsers/imageParser'
import { parseEmail } from '../parsers/emailParser'
import { geocodeLocation } from '../utils/geocoder'
import { query } from '../db/postgres'
import { addIngestJob } from '../queue/jobs/ingestJob'
import { emitComplaintNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { ComplaintSource } from '../types/complaint'

const router = Router()

// ── Multer: store files in memory (max 20MB per file, max 10 files) ───────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/csv', 'image/jpeg', 'image/png', 'image/webp', 'message/rfc822']
    // also allow by extension for CSV (browsers send text/plain for .csv)
    const isAllowed = allowed.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.eml')
    cb(null, isAllowed)
  },
})

// ── Detect source type from mimetype / filename ───────────────────────────
function detectSource(mimetype: string, originalname: string): ComplaintSource {
  if (mimetype === 'application/pdf') return 'pdf'
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype === 'message/rfc822' || originalname.endsWith('.eml')) return 'email'
  if (mimetype === 'text/csv' || originalname.endsWith('.csv')) return 'csv'
  return 'csv'
}

// ── Extract text from a file based on its source type ────────────────────
async function extractText(
  buffer: Buffer,
  source: ComplaintSource,
  mimetype: string
): Promise<{ text: string; sender?: string; locationHint?: string; timestamp?: string }[]> {

  if (source === 'pdf') {
    const { text } = await parsePdf(buffer)
    return [{ text }]
  }

  if (source === 'image') {
    const { text } = await parseImage(buffer, mimetype)
    return [{ text }]
  }

  if (source === 'email') {
    const { text, from, date } = await parseEmail(buffer)
    return [{ text, sender: from, timestamp: date }]
  }

  if (source === 'csv') {
    const rows = parseCsv(buffer)
    return rows.map((r) => ({
      text: r.text,
      sender: r.sender,
      locationHint: r.location,
      timestamp: r.timestamp,
    }))
  }

  return []
}

// ── POST /ingest ──────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.array('files', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' })
      return
    }

    const inserted: string[] = []

    for (const file of files) {
      const source = detectSource(file.mimetype, file.originalname)

      let records: { text: string; sender?: string; locationHint?: string; timestamp?: string }[]

      try {
        records = await extractText(file.buffer, source, file.mimetype)
      } catch (parseErr) {
        logger.warn(`Skipping ${file.originalname}: ${String(parseErr)}`)
        continue
      }

      for (const record of records) {
        if (!record.text || record.text.length < 5) continue

        // Try to geocode the location hint
        const coords = geocodeLocation(record.locationHint ?? record.text)

        const rows = await query<{ id: string }>(
          `INSERT INTO complaints
             (source, raw_text, location_hint, lat, lng, sender, timestamp, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
           RETURNING id`,
          [
            source,
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
          // Dispatch to BullMQ — agent will classify + embed async
          await addIngestJob({ complaintId: id, rawText: record.text, source })
          logger.info(`Complaint ingested + job queued — id: ${id}, source: ${source}`)

          // Emit live to the dashboard feed immediately (pre-classification)
          emitComplaintNew({
            id,
            source,
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

    res.status(201).json({
      message: `${inserted.length} complaint(s) ingested`,
      ids: inserted,
    })
  } catch (err) {
    logger.error(`Ingest error: ${String(err)}`)
    res.status(500).json({ error: 'Ingest failed' })
  }
})

export default router
