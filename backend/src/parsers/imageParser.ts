import Tesseract from 'tesseract.js'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils/logger'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ParsedImage {
  text: string           // extracted complaint text
  method: 'ocr' | 'vision'
}

// ── Step 1: pre-process with sharp (grayscale + sharpen for better OCR) ──
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .grayscale()
    .sharpen()
    .normalize()
    .toBuffer()
}

// ── Step 2a: OCR via tesseract.js ─────────────────────────────────────────
async function runOcr(buffer: Buffer): Promise<string> {
  const processed = await preprocessImage(buffer)
  const { data } = await Tesseract.recognize(processed, 'eng', {
    logger: () => undefined,   // silence tesseract progress logs
  })
  return data.text.trim()
}

// ── Step 2b: Claude vision fallback (for low-confidence OCR) ─────────────
async function runVision(buffer: Buffer, mimeType: string): Promise<string> {
  const base64 = buffer.toString('base64')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 },
          },
          {
            type: 'text',
            text: 'This is a customer complaint screenshot or photo. Extract and return only the complaint text — the exact words the customer wrote. No commentary.',
          },
        ],
      },
    ],
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

// ── Main export ───────────────────────────────────────────────────────────
export async function parseImage(buffer: Buffer, mimeType = 'image/jpeg'): Promise<ParsedImage> {
  try {
    const ocrText = await runOcr(buffer)

    // If OCR got meaningful text (>20 chars), use it — it's faster and free
    if (ocrText.length > 20) {
      logger.debug(`Image parsed via OCR — ${ocrText.length} chars`)
      return { text: ocrText, method: 'ocr' }
    }

    // OCR failed or got garbage — fall back to Claude vision
    logger.debug('OCR insufficient, falling back to Claude vision')
    const visionText = await runVision(buffer, mimeType)
    logger.debug(`Image parsed via Claude vision — ${visionText.length} chars`)
    return { text: visionText, method: 'vision' }
  } catch (err) {
    logger.error(`Image parse error: ${String(err)}`)
    throw new Error('Failed to parse image file')
  }
}
