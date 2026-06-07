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
    description: 'Get towers, optionally filtered by status. Use to find critical/degraded/offline towers.',
    input_schema: {
      type: 'object' as const,
      properties: {
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
      const status = input.status as string | undefined
      const rows = status
        ? await query<{ id: string; name: string; status: string; active_complaints: number; affected_users: number }>(
            `SELECT id, name, status, active_complaints, affected_users
             FROM towers WHERE status = $1 ORDER BY affected_users DESC`,
            [status]
          )
        : await query<{ id: string; name: string; status: string; active_complaints: number; affected_users: number }>(
            `SELECT id, name, status, active_complaints, affected_users
             FROM towers WHERE status != 'operational' ORDER BY affected_users DESC`
          )

      rows.forEach((t) => ctx.highlights.add(t.id))   // capture for map hint
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

  const answer = await runAgent(systemPrompt, question, TOOLS, makeExecutor(ctx))

  return {
    answer,
    map_highlights: ctx.highlights.size > 0 ? [...ctx.highlights] : undefined,
    chart_data: ctx.chart ?? undefined,
  }
}
