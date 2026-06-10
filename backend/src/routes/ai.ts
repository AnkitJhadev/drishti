import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { runNLQueryAgent } from '../agents/nlQueryAgent'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

// POST /ai/chat — natural language query → RAG → grounded answer
router.post('/chat', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body as { message?: string }
    const operator = req.operator!

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' })
      return
    }

    // Persist the user message
    await query(
      `INSERT INTO chat_messages (operator_id, role, content) VALUES ($1, 'user', $2)`,
      [operator.id, message]
    )

    let result: { answer: string; map_highlights?: string[]; chart_data?: Record<string, number> }
    try {
      result = await runNLQueryAgent(message)
    } catch (agentErr) {
      logger.error(`NL agent error: ${String(agentErr)}`)
      // Graceful fallback — every LLM provider was unavailable (e.g. all keys
      // rate-limited). Still return a valid response so the chat doesn't error out.
      result = {
        answer:
          'The AI service is busy right now (all LLM providers are rate-limited). Please try again in a minute.',
      }
    }

    // Persist the assistant message with hints
    await query(
      `INSERT INTO chat_messages (operator_id, role, content, map_highlights, chart_data)
       VALUES ($1, 'assistant', $2, $3, $4)`,
      [
        operator.id,
        result.answer,
        result.map_highlights ? JSON.stringify(result.map_highlights) : null,
        result.chart_data ? JSON.stringify(result.chart_data) : null,
      ]
    )

    res.json({
      answer: result.answer,
      map_highlights: result.map_highlights ?? [],
      chart_data: result.chart_data ?? null,
    })
  } catch (err) {
    logger.error(`POST /ai/chat error: ${String(err)}`)
    res.status(500).json({ error: 'Chat failed' })
  }
})

export default router
