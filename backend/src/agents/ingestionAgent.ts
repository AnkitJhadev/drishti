import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { query } from '../db/postgres'
import { indexComplaint } from '../rag/indexer'
import { geocodeLocation } from '../utils/geocoder'
import { emitComplaintNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { IssueType, Severity, EnrichedComplaint } from '../types/complaint'
import type { SourceType } from '../rag/chunker'

// ── Normalizers — coerce loose LLM output to strict enums ─────────────────
const ISSUE_TYPES: IssueType[] = [
  'network_outage', 'call_drop', 'slow_internet', 'tower_failure', 'billing_issue', 'unknown',
]
const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical']

function normalizeIssueType(value: string): IssueType {
  const slug = (value ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_')
  return (ISSUE_TYPES as string[]).includes(slug) ? (slug as IssueType) : 'unknown'
}

function normalizeSeverity(value: string): Severity {
  const slug = (value ?? '').toLowerCase().trim()
  return (SEVERITIES as string[]).includes(slug) ? (slug as Severity) : 'medium'
}

// ── Single tool: classify + persist in one step (token-efficient) ─────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'classify_issue',
    description: 'Classify the complaint and save it. Call this exactly once.',
    input_schema: {
      type: 'object' as const,
      properties: {
        issue_type: {
          type: 'string',
          enum: ['network_outage', 'call_drop', 'slow_internet', 'tower_failure', 'billing_issue', 'unknown'],
        },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        confidence: { type: 'number', description: '0-1' },
        location_hint: { type: 'string', description: 'City/area mentioned, if any' },
      },
      required: ['issue_type', 'severity', 'confidence'],
    },
  },
]

function makeToolExecutor(complaintId: string) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    if (name !== 'classify_issue') throw new Error(`Unknown tool: ${name}`)

    const raw = input as {
      issue_type: string
      severity: string
      confidence: number
      location_hint?: string
    }
    const issue_type = normalizeIssueType(raw.issue_type)
    const severity = normalizeSeverity(raw.severity)
    const location_hint = raw.location_hint
    const coords = location_hint ? geocodeLocation(location_hint) : null

    await query(
      `UPDATE complaints
       SET issue_type = $1, severity = $2, confidence = $3,
           location_hint = COALESCE($4, location_hint),
           lat = COALESCE($5, lat), lng = COALESCE($6, lng),
           status = 'processing'
       WHERE id = $7`,
      [issue_type, severity, raw.confidence, location_hint ?? null, coords?.[0] ?? null, coords?.[1] ?? null, complaintId]
    )

    logger.info(`Complaint ${complaintId} classified — ${issue_type} / ${severity}`)

    // Emit the enriched complaint to the live feed
    const rows = await query<{
      id: string; source: string; raw_text: string; location_hint: string
      lat: number; lng: number; sender: string; timestamp: string
      status: string; issue_type: IssueType; severity: Severity; confidence: number
    }>(
      `SELECT id, source, raw_text, location_hint, lat, lng, sender,
              timestamp, status, issue_type, severity, confidence
       FROM complaints WHERE id = $1`,
      [complaintId]
    )
    if (rows[0]) {
      const c = rows[0]
      emitComplaintNew({
        id: c.id,
        source: c.source as EnrichedComplaint['source'],
        raw_text: c.raw_text,
        location_hint: c.location_hint ?? '',
        timestamp: c.timestamp,
        sender: c.sender ?? 'unknown',
        status: c.status as EnrichedComplaint['status'],
        issue_type: c.issue_type,
        severity: c.severity,
        coordinates: [c.lat ?? 0, c.lng ?? 0],
        confidence: c.confidence ?? 0,
      })
    }
    return { ok: true }
  }
}

// ── Main export ───────────────────────────────────────────────────────────
export async function runIngestionAgent(
  complaintId: string,
  rawText: string,
  source: SourceType
): Promise<void> {
  logger.info(`Ingestion agent started for complaint ${complaintId}`)

  const systemPrompt = `You classify telecom complaints. Call classify_issue exactly once with the issue type, severity, confidence, and any location mentioned. Network outages and tower failures are more severe than slow internet.`

  const userMessage = `Classify this complaint:\n"${rawText}"`

  // 1. Classify via LLM (single tool call)
  await runAgent(systemPrompt, userMessage, TOOLS, makeToolExecutor(complaintId), 'classify')

  // 2. Embed + index in code (no LLM round-trip needed)
  try {
    const locRows = await query<{ location_hint: string | null }>(
      `SELECT location_hint FROM complaints WHERE id = $1`,
      [complaintId]
    )
    await indexComplaint(complaintId, rawText, source, locRows[0]?.location_hint ?? '')
  } catch (err) {
    logger.warn(`Embedding skipped for ${complaintId}: ${String(err)}`)
  }

  // 3. Mark ready for clustering
  await query(`UPDATE complaints SET status = 'clustered' WHERE id = $1`, [complaintId])

  logger.info(`Ingestion agent complete for complaint ${complaintId}`)
}
