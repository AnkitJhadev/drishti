import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAuth } from '../middleware/auth'
import { runNLQueryAgent } from '../agents/nlQueryAgent'
import { getRecentHistory, recordUserMessage, recordAssistantMessage } from '../memory/chatMemory'
import { validateBody } from '../middleware/validate'
import { chatSchema, type ChatBody } from '../schemas/ai.schema'
import { query } from '../db/postgres'
import { logger } from '../utils/logger'

const router = Router()

// Each chat turn costs LLM tokens against a shared free-tier daily quota
// (~100K/day on Groq). Per-IP throttle so one scripted client can't drain it
// and kill the demo for everyone else.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Slow down — max 8 questions per minute' },
})

// POST /ai/chat — natural language query → RAG → grounded answer
router.post('/chat', requireAuth, chatLimiter, validateBody(chatSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body as ChatBody
    const operator = req.operator!

    // Short-term memory: fetch recent turns BEFORE recording the new one,
    // then persist the user message.
    const history = await getRecentHistory(operator.id)
    await recordUserMessage(operator.id, message)

    let result: { answer: string; map_highlights?: string[]; chart_data?: Record<string, number> }
    try {
      result = await runNLQueryAgent(message, history)
    } catch (agentErr) {
      logger.error(`NL agent error: ${String(agentErr)}`)
      // Graceful fallback — every LLM provider was unavailable (e.g. all keys
      // rate-limited). Still return a valid response so the chat doesn't error out.
      result = {
        answer:
          'The AI service is busy right now (all LLM providers are rate-limited). Please try again in a minute.',
      }
    }

    await recordAssistantMessage(operator.id, result.answer, result.map_highlights, result.chart_data)

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

// DELETE /ai/chat/history — clears conversation memory for the logged-in operator
router.delete('/chat/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await query(`DELETE FROM chat_messages WHERE operator_id = $1`, [req.operator!.id])
    logger.info(`Chat history cleared for operator ${req.operator!.id}`)
    res.json({ message: 'Chat history cleared' })
  } catch (err) {
    logger.error(`DELETE /ai/chat/history error: ${String(err)}`)
    res.status(500).json({ error: 'Failed to clear history' })
  }
})

export default router
