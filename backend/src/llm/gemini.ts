import { GoogleGenerativeAI } from '@google/generative-ai'
import type Anthropic from '@anthropic-ai/sdk'
import { logger } from '../utils/logger'

// Google Gemini — free tier. Vision + a tool-calling fallback for the agents.
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.0-flash'
const TEXT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
const MAX_ITERATIONS = 12

type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<unknown>

// ── Vision ─────────────────────────────────────────────────────────────────
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  const model = genai.getGenerativeModel({ model: VISION_MODEL })
  const result = await model.generateContent([prompt, { inlineData: { data: base64, mimeType } }])
  return result.response.text().trim()
}

export async function geminiText(systemPrompt: string, userMessage: string): Promise<string> {
  const model = genai.getGenerativeModel({ model: TEXT_MODEL, systemInstruction: systemPrompt })
  const result = await model.generateContent(userMessage)
  return result.response.text().trim()
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

  const model = genai.getGenerativeModel({
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
}
