import OpenAI from 'openai'

// Together AI — OpenAI-compatible, free credits. Fallback when Groq is rate-limited.
export const togetherClient = new OpenAI({
  apiKey: process.env.TOGETHER_API_KEY ?? '',
  baseURL: 'https://api.together.xyz/v1',
})

export const TOGETHER_MODEL =
  process.env.TOGETHER_MODEL ?? 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'
