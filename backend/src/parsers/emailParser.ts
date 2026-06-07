import { simpleParser, type ParsedMail } from 'mailparser'
import { logger } from '../utils/logger'

export interface ParsedEmail {
  subject: string
  from: string
  text: string
  html: string
  date: string
}

// Parse a raw email buffer (from IMAP or .eml file upload)
export async function parseEmail(buffer: Buffer): Promise<ParsedEmail> {
  try {
    const mail: ParsedMail = await simpleParser(buffer)

    const from =
      mail.from?.text ??
      mail.from?.value?.[0]?.address ??
      'unknown@unknown.com'

    const text = (mail.text ?? mail.html ?? '').toString().trim()

    logger.debug(`Email parsed — from: ${from}, subject: ${mail.subject ?? '(no subject)'}`)

    return {
      subject: mail.subject ?? '',
      from,
      text,
      html: typeof mail.html === 'string' ? mail.html : '',
      date: mail.date?.toISOString() ?? new Date().toISOString(),
    }
  } catch (err) {
    logger.error(`Email parse error: ${String(err)}`)
    throw new Error('Failed to parse email file')
  }
}
