import pdfParse from 'pdf-parse'
import { isGeocodable } from '../utils/geocoder'
import { logger } from '../utils/logger'

export interface ParsedDocument {
  text: string
  pageCount: number
}

export interface StructuredPdf {
  text: string              // full complaint body (classified by the LLM)
  locationHint?: string     // value of the Location: / Service Area: field
  sender?: string           // value of the Mobile: / Phone: / Customer: field
}

export class PdfFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfFormatError'
  }
}

// unpdf is ESM-only; load via Function import so it survives the CJS transpile.
const importESM = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

// Primary: unpdf (modern PDF.js with xref recovery — tolerant of broken PDFs)
async function parseWithUnpdf(buffer: Buffer): Promise<ParsedDocument> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { getDocumentProxy, extractText } = (await importESM('unpdf')) as any
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  const merged = Array.isArray(text) ? text.join(' ') : String(text)
  return { text: clean(merged), pageCount: totalPages ?? 0 }
}

// Fallback: pdf-parse (works for well-formed PDFs)
async function parseWithPdfParse(buffer: Buffer): Promise<ParsedDocument> {
  const data = await pdfParse(buffer)
  return { text: clean(data.text), pageCount: data.numpages }
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await parseWithUnpdf(buffer)
    if (result.text.length > 0) {
      logger.debug(`PDF parsed via unpdf — ${result.pageCount} pages, ${result.text.length} chars`)
      return result
    }
    throw new Error('unpdf returned empty text')
  } catch (unpdfErr) {
    logger.warn(`unpdf failed (${String(unpdfErr)}), trying pdf-parse`)
    try {
      const result = await parseWithPdfParse(buffer)
      logger.debug(`PDF parsed via pdf-parse — ${result.pageCount} pages, ${result.text.length} chars`)
      return result
    } catch (err) {
      logger.error(`PDF parse error (both parsers failed): ${String(err)}`)
      throw new Error('Failed to parse PDF file')
    }
  }
}

// Extract a labelled field value, e.g. extractField(text, 'location|service area').
// Stops at the next known label/keyword so we don't swallow the rest of the doc.
function extractField(text: string, labels: string): string | undefined {
  const re = new RegExp(
    `(?:${labels})\\s*:\\s*([A-Za-z0-9][A-Za-z0-9 .,'@()+/-]{1,60}?)` +
      `(?=\\s*(?:date|customer|mobile|phone|subject|service area|location|issue type|severity|regards|to the)\\b|$)`,
    'i'
  )
  const m = text.match(re)
  return m?.[1]?.trim() || undefined
}

// ── Fixed, structured complaint PDF ───────────────────────────────────────
// A valid complaint PDF MUST contain a "Location:" (or "Service Area:") field
// whose value is a recognised city/area, plus readable complaint text.
// Free-form PDFs that don't follow the template are rejected.
export async function parseStructuredPdf(buffer: Buffer): Promise<StructuredPdf> {
  const { text } = await parsePdf(buffer)

  if (!text || text.length < 20) {
    throw new PdfFormatError('PDF contains no readable complaint text.')
  }

  if (!/(?:service area|location)\s*:/i.test(text)) {
    throw new PdfFormatError(
      'PDF is missing a "Location:" (or "Service Area:") field. ' +
        'Use the structured complaint report format.'
    )
  }

  const locationHint = extractField(text, 'service area|location')

  // The Location field value, or failing that the body, must name a known area.
  if (!isGeocodable(locationHint) && !isGeocodable(text)) {
    throw new PdfFormatError(
      `PDF location "${locationHint ?? 'unknown'}" is not a recognised city/area.`
    )
  }

  return {
    text,
    locationHint: locationHint ?? undefined,
    sender: extractField(text, 'mobile|phone|customer'),
  }
}
