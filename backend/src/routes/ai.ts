import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth'
import { runNLQueryAgent } from '../agents/nlQueryAgent'
import { getRecentHistory, recordUserMessage, recordAssistantMessage } from '../memory/chatMemory'
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

export default router
