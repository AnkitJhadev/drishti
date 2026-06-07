import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import { geminiVision } from '../llm/gemini'
import { logger } from '../utils/logger'

export interface ParsedImage {
  text: string
  method: 'ocr' | 'vision'
}

// ── Pre-process with sharp (grayscale + sharpen for better OCR) ──
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).grayscale().sharpen().normalize().toBuffer()
}

// ── OCR via tesseract.js (free, local, primary) ───────────────────────────
async function runOcr(buffer: Buffer): Promise<string> {
  const processed = await preprocessImage(buffer)
  const { data } = await Tesseract.recognize(processed, 'eng', { logger: () => undefined })
  return data.text.trim()
}

// ── Main export ───────────────────────────────────────────────────────────
export async function parseImage(buffer: Buffer, mimeType = 'image/jpeg'): Promise<ParsedImage> {
  try {
    const ocrText = await runOcr(buffer)

    // OCR good enough? Use it — fast and free.
    if (ocrText.length > 20) {
      logger.debug(`Image parsed via OCR — ${ocrText.length} chars`)
      return { text: ocrText, method: 'ocr' }
    }

    // Weak OCR — try Gemini vision (free), fall back to OCR text on failure.
    try {
      const visionText = await geminiVision(
        buffer.toString('base64'),
        mimeType,
        'This is a customer complaint screenshot or photo. Extract and return only the complaint text — the exact words the customer wrote. No commentary.'
      )
      if (visionText.length > 0) {
        logger.debug(`Image parsed via Gemini vision — ${visionText.length} chars`)
        return { text: visionText, method: 'vision' }
      }
    } catch (visionErr) {
      logger.warn(`Vision fallback failed, using OCR text: ${String(visionErr)}`)
    }

    return { text: ocrText, method: 'ocr' }
  } catch (err) {
    logger.error(`Image parse error: ${String(err)}`)
    throw new Error('Failed to parse image file')
  }
}
