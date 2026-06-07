import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { query } from '../db/postgres'
import { indexComplaint } from '../rag/indexer'
import { geocodeLocation } from '../utils/geocoder'
import { emitComplaintNew } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { IssueType, Severity, EnrichedComplaint } from '../types/complaint'
import type { SourceType } from '../rag/chunker'

// ── Tool definitions ──────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'classify_issue',
    description: 'Classify the complaint into an issue type and severity level',
    input_schema: {
      type: 'object' as const,
      properties: {
        issue_type: {
          type: 'string',
          enum: ['network_outage', 'call_drop', 'slow_internet', 'tower_failure', 'billing_issue', 'unknown'],
          description: 'The type of issue described in the complaint',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Severity based on impact: critical=total outage/many users, high=major degradation, medium=partial issues, low=minor inconvenience',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0-1 for this classification',
        },
        location_hint: {
          type: 'string',
          description: 'Any location mentioned in the complaint (city, area, landmark)',
        },
      },
      required: ['issue_type', 'severity', 'confidence'],
    },
  },
  {
    name: 'save_complaint',
    description: 'Save the classified complaint to the database',
    input_schema: {
      type: 'object' as const,
      properties: {
        complaint_id: { type: 'string', description: 'The complaint UUID to update' },
        issue_type: { type: 'string', description: 'Classified issue type' },
        severity: { type: 'string', description: 'Classified severity' },
        confidence: { type: 'number', description: 'Classification confidence' },
        location_hint: { type: 'string', description: 'Extracted location hint' },
      },
      required: ['complaint_id', 'issue_type', 'severity', 'confidence'],
    },
  },
  {
    name: 'embed_and_index',
    description: 'Chunk, embed, and store the complaint text in the vector database for RAG',
    input_schema: {
      type: 'object' as const,
      properties: {
        complaint_id: { type: 'string' },
        text: { type: 'string' },
        source_type: { type: 'string' },
        location_hint: { type: 'string' },
      },
      required: ['complaint_id', 'text', 'source_type'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────
function makeToolExecutor(complaintId: string, rawText: string, source: SourceType) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    if (name === 'classify_issue') {
      // Just return the input — Claude is doing the classification
      return { ok: true, classification: input }
    }

    if (name === 'save_complaint') {
      const { issue_type, severity, confidence, location_hint } = input as {
        complaint_id: string
        issue_type: IssueType
        severity: Severity
        confidence: number
        location_hint?: string
      }

      // Geocode if a location hint was extracted
      const coords = location_hint ? geocodeLocation(location_hint) : null

      await query(
        `UPDATE complaints
         SET issue_type  = $1,
             severity    = $2,
             confidence  = $3,
             location_hint = COALESCE($4, location_hint),
             lat         = COALESCE($5, lat),
             lng         = COALESCE($6, lng),
             status      = 'processing'
         WHERE id = $7`,
        [
          issue_type,
          severity,
          confidence,
          location_hint ?? null,
          coords?.[0] ?? null,
          coords?.[1] ?? null,
          complaintId,
        ]
      )

      logger.info(`Complaint ${complaintId} classified — ${issue_type} / ${severity}`)

      // Emit the enriched complaint to the live feed
      const enriched = await query<{
        id: string; source: string; raw_text: string; location_hint: string
        lat: number; lng: number; sender: string; timestamp: string
        status: string; issue_type: IssueType; severity: Severity; confidence: number
      }>(
        `SELECT id, source, raw_text, location_hint, lat, lng, sender,
                timestamp, status, issue_type, severity, confidence
         FROM complaints WHERE id = $1`,
        [complaintId]
      )
      if (enriched[0]) {
        const c = enriched[0]
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

    if (name === 'embed_and_index') {
      const { location_hint } = input as { location_hint?: string }

      await indexComplaint(
        complaintId,
        rawText,
        source,
        location_hint ?? ''
      )

      // Mark complaint as clustered-ready
      await query(
        `UPDATE complaints SET status = 'clustered' WHERE id = $1`,
        [complaintId]
      )

      return { ok: true }
    }

    throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Main export ───────────────────────────────────────────────────────────
export async function runIngestionAgent(
  complaintId: string,
  rawText: string,
  source: SourceType
): Promise<void> {
  logger.info(`Ingestion agent started for complaint ${complaintId}`)

  const systemPrompt = `You are an AI agent for a telecom operations platform.
Your job is to analyze customer complaints and classify them accurately.

Steps you MUST follow in order:
1. Call classify_issue to determine the issue type, severity, and any location mentioned
2. Call save_complaint to persist the classification
3. Call embed_and_index to store the complaint in the vector database

Be precise. Network outages and tower failures are more severe than slow internet.
If a location is mentioned (city, area, neighborhood), extract it.`

  const userMessage = `Classify and process this telecom complaint (ID: ${complaintId}, source: ${source}):

"${rawText}"`

  await runAgent(
    systemPrompt,
    userMessage,
    TOOLS,
    makeToolExecutor(complaintId, rawText, source),
    'classify'
  )

  logger.info(`Ingestion agent complete for complaint ${complaintId}`)
}
