// Core tool-calling loop — provider-agnostic.
// Switch provider via LLM_PROVIDER env: 'groq' (free) | 'anthropic' (paid).
// All agents call runAgent() with Anthropic-style tool defs; this module
// adapts them to whichever provider is active.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { logger } from '../utils/logger'

type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>

const PROVIDER = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase()
const MAX_ITERATIONS = 12 // safety cap against runaway tool loops

// ── Anthropic (Claude) ─────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function runAnthropic(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    })

    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )
      if (!toolUseBlock) break

      logger.debug(`[claude] tool: ${toolUseBlock.name}`)
      const result = await toolExecutor(
        toolUseBlock.name,
        toolUseBlock.input as Record<string, unknown>
      )
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(result) }],
      })
      continue
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    return textBlock?.text ?? ''
  }
  return ''
}

// ── Groq (OpenAI-compatible, free) ──────────────────────────────────────────
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
})

function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema as Record<string, unknown>,
    },
  }))
}

async function runGroq(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]
  const oaiTools = toOpenAITools(tools)

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      messages,
      tools: oaiTools,
      tool_choice: 'auto',
    })

    const msg = response.choices[0]?.message
    if (!msg) break

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg)
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(tc.function.arguments || '{}')
        } catch {
          args = {}
        }
        logger.debug(`[groq] tool: ${tc.function.name}`)
        const result = await toolExecutor(tc.function.name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
      continue
    }

    return msg.content ?? ''
  }
  return ''
}

// ── Public API — identical signature for all agents ────────────────────────
export async function runAgent(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor
): Promise<string> {
  if (PROVIDER === 'anthropic' || PROVIDER === 'claude') {
    return runAnthropic(systemPrompt, userMessage, tools, toolExecutor)
  }
  return runGroq(systemPrompt, userMessage, tools, toolExecutor)
}
