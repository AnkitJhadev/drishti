import OpenAI from 'openai'

// Together AI — OpenAI-compatible, free credits. Fallback when Groq is rate-limited.
// The OpenAI SDK throws at construction on an empty apiKey, so use a non-empty
// placeholder when the key is absent. This client is only ever *called* when the
// router's hasKey('together') is true (a real key is set), so the placeholder
// never reaches the network — it just keeps app startup from crashing.
export const togetherClient = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY || 'no-together-key',
  baseURL: 'https://api.together.xyz/v1',
})

export const TOGETHER_MODEL =
  process.env.TOGETHER_MODEL ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'
