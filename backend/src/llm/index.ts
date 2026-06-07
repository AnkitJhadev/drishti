import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import { groqClient, GROQ_MODEL } from './groq'
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

function clientFor(provider: Provider): { client: OpenAI; model: string } {
  if (provider === 'together') return { client: togetherClient, model: TOGETHER_MODEL }
  return { client: groqClient, model: GROQ_MODEL }
}

export interface RunOptions {
  // Force exactly one call to this tool and return immediately after executing
  // it — no follow-up completion. Halves token cost for single-shot tasks.
  forceTool?: string
}

// One full tool-calling loop against a single OpenAI-compatible provider.
async function runOnProvider(
  provider: Provider,
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  opts: RunOptions = {}
): Promise<string> {
  const { client, model } = clientFor(provider)
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
          logger.warn(`[${provider}] malformed tool call, retrying once`)
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
        logger.debug(`[${provider}] tool: ${tc.function.name}`)
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

// A provider is usable only if its API key is actually configured.
function hasKey(provider: Provider): boolean {
  const key =
    provider === 'together' ? process.env.TOGETHER_API_KEY
    : provider === 'gemini' ? process.env.GEMINI_API_KEY
    : process.env.GROQ_API_KEY
  return Boolean(key && !key.startsWith('your-'))
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
      return await runOnProvider(provider, systemPrompt, userMessage, tools, toolExecutor, opts)
    } catch (err) {
      lastError = err
      logger.warn(`Provider ${provider} failed for task ${task}: ${String(err)} — trying next`)
    }
  }

  throw lastError ?? new Error(`All providers failed for task ${task}`)
}
