import pdfParse from 'pdf-parse'
import { logger } from '../utils/logger'

export interface ParsedDocument {
  text: string
  pageCount: number
}

export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const data = await pdfParse(buffer)
    const text = data.text
      .replace(/\s+/g, ' ')   // collapse whitespace
      .trim()

    logger.debug(`PDF parsed — ${data.numpages} pages, ${text.length} chars`)

    return {
      text,
      pageCount: data.numpages,
    }
  } catch (err) {
    logger.error(`PDF parse error: ${String(err)}`)
    throw new Error('Failed to parse PDF file')
  }
}
