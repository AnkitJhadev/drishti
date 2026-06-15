import { GoogleGenerativeAI } from '@google/generative-ai'
import type Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils/logger'

// Google Gemini — free tier. Vision + a tool-calling fallback for the agents.
// Collect every configured key: GEMINI_API_KEY, GEMINI_API_KEY_2, … _10.
// Multiple keys (separate Google projects) pool the free-tier quota; we rotate
// across them on quota/auth errors, exactly like the Groq key rotation.
function collectGeminiKeys(): string[] {
  const raw: (string | undefined)[] = [process.env.GEMINI_API_KEY]
  for (let i = 2; i <= 10; i++) raw.push(process.env[`GEMINI_API_KEY_${i}`])
  const keys = raw
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k) && !k!.startsWith('your-'))
  return [...new Set(keys)]
}

export const geminiKeys = collectGeminiKeys()
const geminiClients = geminiKeys.map((k) => new GoogleGenerativeAI(k))

export function hasGeminiKey(): boolean {
  return geminiClients.length > 0
}

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'
const TEXT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
const MAX_ITERATIONS = 12

// A key is "used up" on quota (429), bad/blocked key (400 invalid / 401 / 403),
// or transient 5xx — rotate to the next one. Anything else is a real error.
function isKeyUnusable(err: unknown): boolean {
  const status = (err as { status?: number })?.status
  const msg = String((err as { message?: string })?.message ?? err)
  if (status === 429 || status === 401 || status === 403) return true
  if (status !== undefined && status >= 500) return true
  return /\b429\b|\b401\b|\b403\b|quota|rate limit|too many requests|api key not valid|api_key_invalid|permission/i.test(msg)
}

// Sticky rotating pointer — spread load and stay on the key that last worked.
let geminiStart = 0

// Run `fn` against each Gemini key in turn, rotating past an unusable one.
// Throws only if every key fails (→ router falls through to the next provider).
async function withGeminiRotation<T>(fn: (client: GoogleGenerativeAI) => Promise<T>): Promise<T> {
  const n = geminiClients.length
  if (n === 0) throw new Error('No Gemini API key configured')
  let lastError: unknown
  for (let i = 0; i < n; i++) {
    const idx = (geminiStart + i) % n
    try {
      const result = await fn(geminiClients[idx])
      geminiStart = idx
      return result
    } catch (err) {
      lastError = err
      if (isKeyUnusable(err)) {
        logger.warn(`Gemini key #${idx + 1} unusable (${(err as { status?: number })?.status ?? 'err'}) — rotating to next key`)
        geminiStart = (idx + 1) % n
        continue
      }
      throw err
    }
  }
  throw lastError ?? new Error('All Gemini keys exhausted')
}

type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>

// ── Vision ─────────────────────────────────────────────────────────────────
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  return withGeminiRotation(async (client) => {
    const model = client.getGenerativeModel({ model: VISION_MODEL })
    const result = await model.generateContent([prompt, { inlineData: { data: base64, mimeType } }])
    return result.response.text().trim()
  })
}

export async function geminiText(systemPrompt: string, userMessage: string): Promise<string> {
  return withGeminiRotation(async (client) => {
    const model = client.getGenerativeModel({ model: TEXT_MODEL, systemInstruction: systemPrompt })
    const result = await model.generateContent(userMessage)
    return result.response.text().trim()
  })
}

// ── Schema conversion: JSON Schema (lowercase) → Gemini Schema (uppercase) ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {}
  if (schema.type) out.type = String(schema.type).toUpperCase()
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (schema.items) out.items = convertSchema(schema.items)
  if (schema.properties) {
    out.properties = {}
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = convertSchema(v)
    // Gemini rejects empty property objects — inject a harmless field.
    if (Object.keys(out.properties).length === 0) {
      out.properties = { _noop: { type: 'STRING', description: 'unused' } }
    }
  }
  if (schema.required) out.required = schema.required
  return out
}

// ── Tool-calling loop ───────────────────────────────────────────────────────
export async function runGeminiTools(
  systemPrompt: string,
  userMessage: string,
  tools: Anthropic.Tool[],
  toolExecutor: ToolExecutor,
  opts: { forceTool?: string } = {}
): Promise<string> {
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    parameters: convertSchema(t.input_schema),
  }))

  return withGeminiRotation(async (client) => {
    const model = client.getGenerativeModel({
      model: TEXT_MODEL,
      systemInstruction: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ functionDeclarations }] as any,
      ...(opts.forceTool
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [opts.forceTool] } } as any,
          }
        : {}),
    })

    const chat = model.startChat()
    let result = await chat.sendMessage(userMessage)

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const calls = result.response.functionCalls() ?? []
      if (calls.length === 0) return result.response.text()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responses: any[] = []
      for (const call of calls) {
        logger.debug(`[gemini] tool: ${call.name}`)
        const out = await toolExecutor(call.name, (call.args ?? {}) as Record<string, unknown>)
        responses.push({ functionResponse: { name: call.name, response: { result: out } } })
      }

      if (opts.forceTool) return '' // single-shot mode

      result = await chat.sendMessage(responses)
    }
    return ''
  })
}
