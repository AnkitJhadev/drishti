import pdfParse from 'pdf-parse'
import { logger } from '../utils/logger'

export interface ParsedDocument {
  text: string
  pageCount: number
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
