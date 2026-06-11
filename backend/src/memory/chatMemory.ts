import { query } from '../db/postgres'

// Short-term conversational memory for the NL assistant.
// Backed by the chat_messages table; encapsulates persistence + recent-history
// retrieval so routes/agents don't touch SQL directly.

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

// How many recent messages (≈ 3 exchanges) to feed back as context.
const MAX_TURNS = 6
// Cap each turn's length so a long answer can't blow up the prompt token budget.
const MAX_CHARS_PER_TURN = 400

export async function recordUserMessage(operatorId: string, content: string): Promise<void> {
  await query(
    `INSERT INTO chat_messages (operator_id, role, content) VALUES ($1, 'user', $2)`,
    [operatorId, content]
  )
}

export async function recordAssistantMessage(
  operatorId: string,
  content: string,
  mapHighlights?: string[],
  chartData?: Record<string, number>
): Promise<void> {
  await query(
    `INSERT INTO chat_messages (operator_id, role, content, map_highlights, chart_data)
     VALUES ($1, 'assistant', $2, $3, $4)`,
    [
      operatorId,
      content,
      mapHighlights ? JSON.stringify(mapHighlights) : null,
      chartData ? JSON.stringify(chartData) : null,
    ]
  )
}

// The most recent turns for this operator, oldest → newest, ready to prepend
// as conversational context. Call BEFORE recording the current user message.
export async function getRecentHistory(operatorId: string, limit = MAX_TURNS): Promise<ChatTurn[]> {
  const rows = await query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE operator_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [operatorId, limit]
  )
  return rows
    .reverse() // chronological
    .map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: r.content.slice(0, MAX_CHARS_PER_TURN),
    }))
}

// Render history as a compact text block for the agent prompt.
export function formatHistory(history: ChatTurn[]): string {
  return history.map((t) => `${t.role === 'user' ? 'Operator' : 'Drishti'}: ${t.content}`).join('\n')
}
