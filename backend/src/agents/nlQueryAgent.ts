import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { query } from '../db/postgres'
import { retrieveRelevant } from '../rag/retriever'
import { logger } from '../utils/logger'

export interface NLQueryResult {
  answer: string
  map_highlights?: string[]
  chart_data?: Record<string, number>
}

// ── Tool definitions ──────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_rag_store',
    description: 'Semantic search over complaint text to find relevant complaints by meaning',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_complaints_by_filter',
    description: 'Get complaint counts grouped by a field (issue_type, severity, or status)',
    input_schema: {
      type: 'object' as const,
      properties: {
        group_by: { type: 'string', enum: ['issue_type', 'severity', 'status'] },
      },
      required: ['group_by'],
    },
  },
  {
    name: 'get_tower_status',
    description:
      'Look up towers. Pass tower_id to fetch ONE specific tower of any status (e.g. to check if a tower exists). ' +
      'Pass status to filter (critical/degraded/offline). Pass neither to list ALL towers. Returns at most one row per call when tower_id is given.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tower_id: { type: 'string', description: 'A specific tower id, e.g. "T-121"' },
        status: { type: 'string', enum: ['operational', 'degraded', 'critical', 'offline'] },
      },
      required: [],
    },
  },
  {
    name: 'get_cluster_summary',
    description: 'Get a summary of active complaint clusters and their correlated towers',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

interface ToolContext {
  highlights: Set<string>
  chart: Record<string, number> | null
}

function makeExecutor(ctx: ToolContext) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    if (name === 'search_rag_store') {
      const q = input.query as string
      try {
        const chunks = await retrieveRelevant(q, 5)
        return {
          results: chunks.map((c) => ({
            text: c.text,
            location: c.location_hint,
            score: c.score,
          })),
        }
      } catch {
        return { results: [], note: 'Vector store unavailable' }
      }
    }

    if (name === 'get_complaints_by_filter') {
      const groupBy = input.group_by as string
      const allowed = ['issue_type', 'severity', 'status']
      const col = allowed.includes(groupBy) ? groupBy : 'issue_type'

      const rows = await query<{ key: string; count: string }>(
        `SELECT ${col} as key, COUNT(*) as count
         FROM complaints
         WHERE ${col} IS NOT NULL
         GROUP BY ${col}
         ORDER BY count DESC`
      )

      const chart: Record<string, number> = {}
      rows.forEach((r) => {
        chart[r.key] = parseInt(r.count, 10)
      })
      ctx.chart = chart   // capture for visualization hint
      return { breakdown: chart }
    }

    if (name === 'get_tower_status') {
      const towerId = (input.tower_id as string | undefined)?.trim()
      const status = input.status as string | undefined
      const cols = 'id, name, status, active_complaints, affected_users'
      type Row = { id: string; name: string; status: string; active_complaints: number; affected_users: number }

      let rows: Row[]
      if (towerId) {
        // Specific tower lookup — any status (so newly-added/operational towers are found).
        rows = await query<Row>(`SELECT ${cols} FROM towers WHERE id = $1`, [towerId])
        if (rows.length === 0) return { towers: [], note: `No tower found with id "${towerId}".` }
      } else if (status) {
        rows = await query<Row>(`SELECT ${cols} FROM towers WHERE status = $1 ORDER BY affected_users DESC`, [status])
      } else {
        // List all towers, worst-status first.
        rows = await query<Row>(
          `SELECT ${cols} FROM towers
           ORDER BY CASE status WHEN 'critical' THEN 1 WHEN 'offline' THEN 2 WHEN 'degraded' THEN 3 ELSE 4 END,
                    affected_users DESC`
        )
      }

      // Highlight on the map only for targeted lookups (not the full list).
      if (towerId || status) rows.forEach((t) => ctx.highlights.add(t.id))
      return { towers: rows }
    }

    if (name === 'get_cluster_summary') {
      const rows = await query(
        `SELECT cl.id, cl.issue_type, cl.size, cl.status, cl.tower_id,
                t.name as tower_name
         FROM clusters cl
         LEFT JOIN towers t ON cl.tower_id = t.id
         WHERE cl.status = 'open'
         ORDER BY cl.size DESC LIMIT 10`
      )
      ;(rows as { tower_id: string | null }[]).forEach((c) => {
        if (c.tower_id) ctx.highlights.add(c.tower_id)
      })
      return { clusters: rows }
    }

    throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Main export ───────────────────────────────────────────────────────────
export async function runNLQueryAgent(question: string): Promise<NLQueryResult> {
  logger.info(`NL query agent: "${question.slice(0, 80)}"`)

  const ctx: ToolContext = { highlights: new Set(), chart: null }

  const systemPrompt = `You are Drishti, an AI assistant for telecom network operators.
You answer questions about the network using ONLY the data returned by your tools.

Guidelines:
- Use search_rag_store to find relevant complaints by meaning.
- Use get_tower_status to inspect tower health (critical/degraded/offline).
- Use get_complaints_by_filter for breakdowns and counts.
- Use get_cluster_summary for active incident clusters.
- Ground every claim in tool data. If the data does not contain the answer,
  say so plainly — never invent towers, numbers, or incidents.
- Be concise and operational. Reference tower IDs (e.g. T-105) and real counts.`

  const answer = await runAgent(systemPrompt, question, TOOLS, makeExecutor(ctx), 'nl_query')

  return {
    answer,
    map_highlights: ctx.highlights.size > 0 ? [...ctx.highlights] : undefined,
    chart_data: ctx.chart ?? undefined,
  }
}
