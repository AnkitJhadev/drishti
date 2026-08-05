import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runNLQueryAgent } from './nlQueryAgent'
import { runAgent } from './agentRunner'
import { prisma } from '../db/prisma'

// Mock at the LLM boundary only — the mocked runAgent invokes the REAL
// toolExecutor built inside nlQueryAgent.ts, so these tests exercise the
// actual tool logic (the thing that had the total-count bug), not a
// simulation of it. Only the model's "which tool to call" decision is faked.
vi.mock('./agentRunner', () => ({ runAgent: vi.fn() }))
vi.mock('../db/prisma', () => ({
  prisma: {
    complaints: { findMany: vi.fn() },
    towers: { findMany: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn() },
    recommendations: { findMany: vi.fn(), groupBy: vi.fn() },
    clusters: { findMany: vi.fn() },
  },
}))
vi.mock('../rag/retriever', () => ({ retrieveRelevant: vi.fn() }))

// Drives one tool call through the real executor and returns its raw result
// as JSON, bypassing everything an actual LLM completion would add.
function mockSingleToolCall(toolName: string, toolInput: Record<string, unknown> = {}) {
  vi.mocked(runAgent).mockImplementation(async (_sys, _user, _tools, toolExecutor) => {
    const result = await toolExecutor(toolName, toolInput)
    return JSON.stringify(result)
  })
}

describe('nlQueryAgent — get_complaints_by_filter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns an authoritative total that matches the real row count — regression test for the "model sums the breakdown itself" bug', async () => {
    vi.mocked(prisma.complaints.findMany).mockResolvedValue([
      { issue_type: 'network_outage', severity: 'high', status: 'clustered' },
      { issue_type: 'network_outage', severity: 'critical', status: 'clustered' },
      { issue_type: 'slow_internet', severity: 'medium', status: 'pending' },
    ] as never)

    mockSingleToolCall('get_complaints_by_filter', { group_by: 'severity' })
    const { answer } = await runNLQueryAgent('How many complaints are there?')
    const parsed = JSON.parse(answer)

    // The bug: the model had to sum breakdown values itself and got it wrong
    // (said 80 instead of 81). Asserting the tool hands back a ready-made
    // total means there's nothing left for the model to get wrong.
    expect(parsed.total).toBe(3)
    const breakdownSum = Object.values(parsed.breakdown as Record<string, number>).reduce((a, b) => a + b, 0)
    expect(breakdownSum).toBe(parsed.total)
  })

  it('groups by issue_type when requested, ignoring rows with a null value for that column', async () => {
    vi.mocked(prisma.complaints.findMany).mockResolvedValue([
      { issue_type: 'billing_issue', severity: 'low', status: 'pending' },
      { issue_type: null, severity: 'low', status: 'pending' }, // not yet classified
    ] as never)

    mockSingleToolCall('get_complaints_by_filter', { group_by: 'issue_type' })
    const { answer } = await runNLQueryAgent('Breakdown by issue type')
    const parsed = JSON.parse(answer)

    expect(parsed.total).toBe(2) // total counts every row, classified or not
    expect(parsed.breakdown).toEqual({ billing_issue: 1 }) // breakdown only counts rows with a value
  })
})

describe('nlQueryAgent — get_tower_summary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('total always equals the sum of the status breakdown', async () => {
    vi.mocked(prisma.towers.groupBy).mockResolvedValue([
      { status: 'operational', _count: { _all: 14 } },
      { status: 'degraded', _count: { _all: 4 } },
      { status: 'critical', _count: { _all: 1 } },
      { status: 'offline', _count: { _all: 1 } },
    ] as never)

    mockSingleToolCall('get_tower_summary')
    const { answer } = await runNLQueryAgent('How many towers are there?')
    const parsed = JSON.parse(answer)

    expect(parsed.total).toBe(20)
    expect(parsed.by_status).toEqual({ operational: 14, degraded: 4, critical: 1, offline: 1 })
  })
})

describe('nlQueryAgent — map highlights', () => {
  beforeEach(() => vi.clearAllMocks())

  it('a looked-up tower is surfaced as a map_highlight on the result', async () => {
    vi.mocked(prisma.towers.findUnique).mockResolvedValue({
      id: 'T-105', name: 'Mumbai Bandra Hub', status: 'critical', active_complaints: 6, affected_users: 900,
    } as never)

    mockSingleToolCall('get_tower_status', { tower_id: 'T-105' })
    const { map_highlights } = await runNLQueryAgent('What is the status of T-105?')

    expect(map_highlights).toEqual(['T-105'])
  })

  it('no highlights are set when the tool path never looks up a tower', async () => {
    vi.mocked(prisma.complaints.findMany).mockResolvedValue([] as never)

    mockSingleToolCall('get_complaints_by_filter', { group_by: 'status' })
    const { map_highlights } = await runNLQueryAgent('How many complaints?')

    expect(map_highlights).toBeUndefined()
  })
})
