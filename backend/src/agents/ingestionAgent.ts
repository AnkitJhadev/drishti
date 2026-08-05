import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { prisma } from '../db/prisma'
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

    await prisma.complaints.update({
      where: { id: complaintId },
      data: {
        issue_type,
        severity,
        confidence: raw.confidence,
        status: 'processing',
        // COALESCE semantics — only overwrite when the agent produced a value.
        ...(location_hint ? { location_hint } : {}),
        ...(coords ? { lat: coords[0], lng: coords[1] } : {}),
      },
    })

    logger.info(`Complaint ${complaintId} classified — ${issue_type} / ${severity}`)

    // Emit the enriched complaint to the live feed
    const c = await prisma.complaints.findUnique({ where: { id: complaintId } })
    if (c) {
      emitComplaintNew({
        id: c.id,
        source: c.source as EnrichedComplaint['source'],
        raw_text: c.raw_text,
        location_hint: c.location_hint ?? '',
        timestamp: (c.timestamp ?? new Date()).toISOString(),
        sender: c.sender ?? 'unknown',
        status: c.status as EnrichedComplaint['status'],
        issue_type: (c.issue_type ?? 'unknown') as IssueType,
        severity: (c.severity ?? 'low') as Severity,
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

  const systemPrompt = `You classify telecom complaints into exactly one issue_type. Call classify_issue exactly once.

## Categories — pick the single best match, even if the wording is informal or doesn't exactly match the examples
- network_outage: no signal, no service, "network down", "no coverage" — a complete or near-complete loss of connectivity.
- call_drop: calls disconnecting or cutting off mid-conversation, poor call quality, echo.
- slow_internet: slow data speeds, buffering, pages/videos not loading, "internet is slow".
- tower_failure: the complaint explicitly blames a tower/mast (e.g. "tower is down", "mast not working"), or describes a highly localized total outage that points to one tower.
- billing_issue: wrong charges, overcharge, billing/invoice disputes — no connectivity complaint.
- unknown: ONLY when the text genuinely does not describe any of the above (e.g. gibberish, unrelated content, or too vague to tell what's wrong). Never use unknown just because the phrasing is informal, unusual, or not a perfect match — infer the closest category from context first.

Also determine severity (low/medium/high/critical — outages and tower failures are more severe than slow internet or billing issues), a confidence score (0-1), and any location mentioned.`

  const userMessage = `Classify this complaint:\n"${rawText}"`

  // 1. Classify via LLM — forced single tool call (1 API call, ~half tokens)
  await runAgent(systemPrompt, userMessage, TOOLS, makeToolExecutor(complaintId), 'classify', {
    forceTool: 'classify_issue',
  })

  // 2. Embed + index in code (no LLM round-trip needed)
  try {
    const loc = await prisma.complaints.findUnique({ where: { id: complaintId }, select: { location_hint: true } })
    await indexComplaint(complaintId, rawText, source, loc?.location_hint ?? '')
  } catch (err) {
    logger.warn(`Embedding skipped for ${complaintId}: ${String(err)}`)
  }

  // 3. Mark ready for clustering
  await prisma.complaints.update({ where: { id: complaintId }, data: { status: 'clustered' } })

  logger.info(`Ingestion agent complete for complaint ${complaintId}`)
}
