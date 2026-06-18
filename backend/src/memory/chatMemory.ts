import { prisma } from '../db/prisma'

// Short-term conversational memory for the NL assistant.
// Backed by the chat_messages table; encapsulates persistence + recent-history
// retrieval so routes/agents don't touch the DB directly.

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

// How many recent messages (≈ 3 exchanges) to feed back as context.
const MAX_TURNS = 6
// Cap each turn's length so a long answer can't blow up the prompt token budget.
const MAX_CHARS_PER_TURN = 400

export async function recordUserMessage(operatorId: string, content: string): Promise<void> {
  await prisma.chat_messages.create({ data: { operator_id: operatorId, role: 'user', content } })
}

export async function recordAssistantMessage(
  operatorId: string,
  content: string,
  mapHighlights?: string[],
  chartData?: Record<string, number>
): Promise<void> {
  await prisma.chat_messages.create({
    data: {
      operator_id: operatorId,
      role: 'assistant',
      content,
      // Json? columns — Prisma serialises objects/arrays directly (no JSON.stringify).
      map_highlights: mapHighlights ?? undefined,
      chart_data: chartData ?? undefined,
    },
  })
}

// The most recent turns for this operator, oldest → newest, ready to prepend
// as conversational context. Call BEFORE recording the current user message.
export async function getRecentHistory(operatorId: string, limit = MAX_TURNS): Promise<ChatTurn[]> {
  const rows = await prisma.chat_messages.findMany({
    where: { operator_id: operatorId },
    select: { role: true, content: true },
    orderBy: { created_at: 'desc' },
    take: limit,
  })
  return rows
    .reverse() // chronological
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: r.content.slice(0, MAX_CHARS_PER_TURN),
    }))
}

// Clear an operator's chat history.
export async function clearHistory(operatorId: string): Promise<void> {
  await prisma.chat_messages.deleteMany({ where: { operator_id: operatorId } })
}

// Render history as a compact text block for the agent prompt.
export function formatHistory(history: ChatTurn[]): string {
  return history.map((t) => `${t.role === 'user' ? 'Operator' : 'Drishti'}: ${t.content}`).join('\n')
}
