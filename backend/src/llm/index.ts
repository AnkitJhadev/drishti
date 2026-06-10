import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { groqClients, GROQ_MODEL } from './groq'
import { togetherClient, TOGETHER_MODEL } from './together'
import { runGeminiTools } from './gemini'
import { routeFor, type AgentTask, type Provider } from './router'
import { logger } from '../utils/logger'

export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>

const MAX_ITERATIONS = 12

// Convert Anthropic-style tool defs → OpenAI function defs (shared by all
// OpenAI-compatible providers).
function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map((t) => {
    const schema = { ...(t.input_schema as Record<string, unknown>) }
    const props = (schema.properties ?? {}) as Record<string, unknown>
    // Llama on Groq rejects function schemas with zero properties — inject a
    // harmless optional field so no-arg tools still validate.
    if (Object.keys(props).length === 0) {
      schema.properties = {
        _noop: { type: 'string', description: 'unused; leave empty' },
      }
    }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: schema,
      },
    }
  })
}

export interface RunOptions {
  // Force exactly one call to this tool and return immediately after executing
  // it — no follow-up completion. Halves token cost for single-shot tasks.
  forceTool?: string
}

// One full tool-calling loop against a single OpenAI-compatible client.
async function runOnProvider(
  client: OpenAI,
  model: string,
  label: string,
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  opts: RunOptions = {}
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]
  const oaiTools = toOpenAITools(tools)
  const toolChoice: OpenAI.Chat.ChatCompletionToolChoiceOption = opts.forceTool
    ? { type: 'function', function: { name: opts.forceTool } }
    : 'auto'

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Llama sometimes emits a malformed tool call (Groq 400). Retry once.
    let response: OpenAI.Chat.ChatCompletion | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await client.chat.completions.create({
          model,
          max_tokens: opts.forceTool ? 400 : 2048,
          messages,
          tools: oaiTools,
          tool_choice: toolChoice,
          parallel_tool_calls: false,
        })
        break
      } catch (err) {
        const is400 = (err as { status?: number }).status === 400
        if (is400 && attempt === 0) {
          logger.warn(`[${label}] malformed tool call, retrying once`)
          continue
        }
        throw err
      }
    }
    if (!response) break

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
        logger.debug(`[${label}] tool: ${tc.function.name}`)
        const result = await toolExecutor(tc.function.name, args)
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
      // Single-shot mode: tool executed, no follow-up call needed.
      if (opts.forceTool) return ''
      continue
    }

    return msg.content ?? ''
  }
  return ''
}

// A provider is usable only if its API key(s) are actually configured.
function hasKey(provider: Provider): boolean {
  if (provider === 'groq') return groqClients.length > 0
  const key = provider === 'together' ? process.env.TOGETHER_API_KEY : process.env.GEMINI_API_KEY
  return Boolean(key && !key.startsWith('your-'))
}

// Errors that mean "this key is exhausted/unusable — try the next one"
// (rate-limited, bad/blocked key, or a transient server error).
function isKeyExhausted(err: unknown): boolean {
  const status = (err as { status?: number }).status
  return status === 429 || status === 401 || status === 403 || (status !== undefined && status >= 500)
}

// Rotating pointer so consecutive calls spread across keys instead of always
// hammering key #1 first.
let groqStart = 0

// Try each Groq key in turn; rotate past a throttled/failed key. Throws only
// if every key is exhausted (→ caller falls through to Gemini).
async function runOnGroq(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  opts: RunOptions
): Promise<string> {
  const n = groqClients.length
  let lastError: unknown
  for (let i = 0; i < n; i++) {
    const idx = (groqStart + i) % n
    try {
      const result = await runOnProvider(
        groqClients[idx], GROQ_MODEL, `groq#${idx + 1}`,
        systemPrompt, userMessage, tools, toolExecutor, opts
      )
      groqStart = idx // stick with the key that just worked
      return result
    } catch (err) {
      lastError = err
      if (isKeyExhausted(err)) {
        logger.warn(`Groq key #${idx + 1} exhausted (status ${(err as { status?: number }).status}) — rotating to next key`)
        groqStart = (idx + 1) % n
        continue
      }
      throw err // non-quota error (e.g. bad request) — don't burn the other keys
    }
  }
  throw lastError ?? new Error('All Groq keys exhausted')
}

// Public entry — runs an agent task with automatic provider fallback.
export async function runLLMAgent(
  task: AgentTask,
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  opts: RunOptions = {}
): Promise<string> {
  const chain = routeFor(task).filter(hasKey)
  if (chain.length === 0) {
    throw new Error('No LLM provider configured. Set GROQ_API_KEY in .env')
  }
  let lastError: unknown

  for (const provider of chain) {
    try {
      if (provider === 'gemini') {
        return await runGeminiTools(systemPrompt, userMessage, tools, toolExecutor, opts)
      }
      if (provider === 'groq') {
        return await runOnGroq(systemPrompt, userMessage, tools, toolExecutor, opts)
      }
      // together
      return await runOnProvider(togetherClient, TOGETHER_MODEL, 'together', systemPrompt, userMessage, tools, toolExecutor, opts)
    } catch (err) {
      lastError = err
      logger.warn(`Provider ${provider} failed for task ${task}: ${String(err)} — trying next`)
    }
  }

  throw lastError ?? new Error(`All providers failed for task ${task}`)
}
