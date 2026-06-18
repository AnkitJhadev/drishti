import Anthropic from '@anthropic-ai/sdk'
import { runAgent } from './agentRunner'
import { prisma } from '../db/prisma'
import { retrieveRelevant } from '../rag/retriever'
import { formatHistory, type ChatTurn } from '../memory/chatMemory'
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
      'Look up SPECIFIC towers or filter by a status. Pass tower_id to fetch ONE tower, or status to list towers of that status. ' +
      'Do NOT use this to answer "how many towers" / totals — use get_tower_summary for counts.',
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
    name: 'get_tower_summary',
    description:
      'Get the TOTAL number of towers and the exact breakdown by status (operational/degraded/critical/offline). ' +
      'Use this for any count/overview question like "how many towers are there?" or "network health". ' +
      'The returned total is the authoritative tower count — never infer it from a filtered list.',
    input_schema: {
      type: 'object' as const,
      properties: {},
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
  {
    name: 'get_recommendations_summary',
    description:
      'Get counts of AI recommendations (the "approvals" queue) by status: pending = awaiting operator approval, ' +
      'plus approved and rejected. Use this for ANY question about approvals, pending actions, or recommended fixes ' +
      '(e.g. "how many are waiting for approval?").',
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

const TOWER_RANK: Record<string, number> = { critical: 1, offline: 2, degraded: 3, operational: 4 }
const PRIORITY_RANK: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 }
const TOWER_SELECT = { id: true, name: true, status: true, active_complaints: true, affected_users: true } as const

function makeExecutor(ctx: ToolContext) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    if (name === 'search_rag_store') {
      const q = input.query as string
      try {
        const chunks = await retrieveRelevant(q, 5)
        return { results: chunks.map((c) => ({ text: c.text, location: c.location_hint, score: c.score })) }
      } catch {
        return { results: [], note: 'Vector store unavailable' }
      }
    }

    if (name === 'get_complaints_by_filter') {
      const groupBy = input.group_by as string
      // Whitelisted column (never user-interpolated into SQL).
      const col: 'issue_type' | 'severity' | 'status' =
        groupBy === 'severity' ? 'severity' : groupBy === 'status' ? 'status' : 'issue_type'

      const all = await prisma.complaints.findMany({ select: { issue_type: true, severity: true, status: true } })
      const chart: Record<string, number> = {}
      for (const c of all) {
        const key = c[col]
        if (key) chart[key] = (chart[key] ?? 0) + 1
      }
      ctx.chart = chart // capture for visualization hint
      return { breakdown: chart }
    }

    if (name === 'get_tower_status') {
      const towerId = (input.tower_id as string | undefined)?.trim()
      const status = input.status as string | undefined

      if (towerId) {
        // Specific tower lookup — any status (so newly-added/operational towers are found).
        const t = await prisma.towers.findUnique({ where: { id: towerId }, select: TOWER_SELECT })
        if (!t) return { towers: [], note: `No tower found with id "${towerId}".` }
        ctx.highlights.add(t.id)
        return { towers: [t] }
      }
      if (status) {
        const rows = await prisma.towers.findMany({ where: { status }, select: TOWER_SELECT, orderBy: { affected_users: 'desc' } })
        rows.forEach((t) => ctx.highlights.add(t.id))
        return { towers: rows }
      }
      // List all towers, worst-status first.
      const rows = await prisma.towers.findMany({ select: TOWER_SELECT })
      rows.sort(
        (a, b) =>
          (TOWER_RANK[a.status ?? 'operational'] ?? 5) - (TOWER_RANK[b.status ?? 'operational'] ?? 5) ||
          (b.affected_users ?? 0) - (a.affected_users ?? 0)
      )
      return { towers: rows }
    }

    if (name === 'get_tower_summary') {
      const grouped = await prisma.towers.groupBy({ by: ['status'], _count: { _all: true } })
      const by_status: Record<string, number> = { operational: 0, degraded: 0, critical: 0, offline: 0 }
      let total = 0
      for (const g of grouped) {
        const n = g._count._all
        if (g.status) by_status[g.status] = n
        total += n
      }
      ctx.chart = by_status // visualize the status breakdown
      return { total, by_status }
    }

    if (name === 'get_recommendations_summary') {
      const grouped = await prisma.recommendations.groupBy({ by: ['status'], _count: { _all: true } })
      const by_status: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
      let total = 0
      for (const g of grouped) {
        const n = g._count._all
        if (g.status) by_status[g.status] = n
        total += n
      }

      // A few highest-priority pending ones for context (and map highlight).
      const pendingRows = await prisma.recommendations.findMany({
        where: { status: 'pending' },
        select: { id: true, priority: true, root_cause: true, tower_id: true, towers: { select: { name: true } } },
      })
      const pending = pendingRows
        .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 5) - (PRIORITY_RANK[b.priority] ?? 5))
        .slice(0, 5)
        .map((p) => ({ id: p.id, priority: p.priority, root_cause: p.root_cause, tower_id: p.tower_id, tower_name: p.towers?.name ?? null }))
      pending.forEach((p) => { if (p.tower_id) ctx.highlights.add(p.tower_id) })

      return { total, by_status, waiting_for_approval: by_status.pending, top_pending: pending }
    }

    if (name === 'get_cluster_summary') {
      const rows = await prisma.clusters.findMany({
        where: { status: 'open' },
        select: { id: true, issue_type: true, size: true, status: true, tower_id: true, towers: { select: { name: true } } },
        orderBy: { size: 'desc' },
        take: 10,
      })
      const clusters = rows.map((c) => ({
        id: c.id, issue_type: c.issue_type, size: c.size, status: c.status, tower_id: c.tower_id, tower_name: c.towers?.name ?? null,
      }))
      clusters.forEach((c) => { if (c.tower_id) ctx.highlights.add(c.tower_id) })
      return { clusters }
    }

    throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Main export ───────────────────────────────────────────────────────────
export async function runNLQueryAgent(question: string, history: ChatTurn[] = []): Promise<NLQueryResult> {
  logger.info(`NL query agent: "${question.slice(0, 80)}"${history.length ? ` (+${history.length} turns context)` : ''}`)

  const ctx: ToolContext = { highlights: new Set(), chart: null }

  const systemPrompt = `You are Drishti, an AI NOC (Network Operations Centre) assistant for a telecom operator.
You help engineers triage network incidents, investigate complaints, and monitor tower health in real time.

## Domain knowledge
- Towers are identified by IDs like T-101, T-102, … T-120. Each tower has a status: operational | degraded | critical | offline.
- A tower becomes "degraded" when it has active complaints; "critical" when complaint volume is high; "offline" when unreachable.
- Complaints are filed by subscribers and classified into issue types: network_outage, call_drop, slow_internet, tower_failure, billing_issue, unknown.
- Severity levels: low, medium, high, critical.
- Clusters are groups of geographically or topically correlated complaints that the pattern agent has linked to one or more towers.
- Recommendations are AI-generated action items tied to a cluster (e.g. "dispatch maintenance to T-112").

## Tools — when to use each
- search_rag_store: find complaints that match a concept (e.g. "no signal in Andheri"), useful for root-cause investigation.
- get_tower_summary: the TOTAL tower count + status breakdown — ALWAYS use this for "how many towers", totals, or network-health overviews. Do not infer totals from a filtered list.
- get_tower_status: look up a SPECIFIC tower by ID, or list towers of one status. Use for "show me critical towers" or checking a named tower — NOT for counting all towers.
- get_complaints_by_filter: get counts broken down by issue_type, severity, or status — use for trend questions and summaries.
- get_cluster_summary: get open incident clusters with their linked towers — use for "what's the biggest incident right now?".
- get_recommendations_summary: counts of recommendations/approvals by status (pending = awaiting approval) — use for "how many are waiting for approval?" and approval-queue questions.

## Response rules
1. ALWAYS ground every number, tower ID, and incident in data returned by a tool. Never invent.
2. Be concise and operational — bullet points and tower IDs are better than paragraphs.
3. If the data does not answer the question, say so plainly and suggest which action could help.
4. The operator may reference earlier turns ("that tower", "those complaints"). Use prior conversation to resolve references; still call tools for fresh data.
5. When highlighting towers on the map, prefer get_tower_status with the relevant status filter.`

  // Fold short-term conversation context into the user turn (keeps the LLM
  // message plumbing unchanged across all providers).
  const userMessage = history.length
    ? `Prior conversation:\n${formatHistory(history)}\n\nNew question: ${question}`
    : question

  const answer = await runAgent(systemPrompt, userMessage, TOOLS, makeExecutor(ctx), 'nl_query')

  return {
    answer,
    map_highlights: ctx.highlights.size > 0 ? [...ctx.highlights] : undefined,
    chart_data: ctx.chart ?? undefined,
  }
}
