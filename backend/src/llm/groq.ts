import OpenAI from 'openai'

const GROQ_BASE = 'https://api.groq.com/openai/v1'

// Collect every configured Groq key: GROQ_API_KEY, GROQ_API_KEY_2, _3, … _10.
// Multiple keys (ideally from separate Groq accounts) pool the free-tier quota;
// the router rotates across them and only falls through to Gemini when all are
// throttled. A single GROQ_API_KEY keeps working unchanged.
function collectGroqKeys(): string[] {
  const raw: (string | undefined)[] = [process.env.GROQ_API_KEY]
  for (let i = 2; i <= 10; i++) raw.push(process.env[`GROQ_API_KEY_${i}`])
  const keys = raw
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k) && !k!.startsWith('your-'))
  return [...new Set(keys)] // dedupe
}

export const groqKeys = collectGroqKeys()

export const groqClients: OpenAI[] = groqKeys.map(
  (apiKey) => new OpenAI({ apiKey, baseURL: GROQ_BASE })
)

// Back-compat: a single client (first key) for any code that imported it.
export const groqClient =
  groqClients[0] ?? new OpenAI({ apiKey: process.env.GROQ_API_KEY ?? '', baseURL: GROQ_BASE })

export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
