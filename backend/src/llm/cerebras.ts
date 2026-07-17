import OpenAI from 'openai'

// Cerebras — OpenAI-compatible, free tier, extremely fast inference.
// Used as a second free primary after Groq (before the Gemini fallback).
// The OpenAI SDK throws at construction on an empty apiKey, so use a non-empty
// placeholder when the key is absent. This client is only ever *called* when the
// router's hasKey('cerebras') is true (a real key is set), so the placeholder
// never reaches the network — it just keeps app startup from crashing.
export const cerebrasClient = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY || 'no-cerebras-key',
  baseURL: 'https://api.cerebras.ai/v1',
})

// gpt-oss-120b has the best tool-calling of the free Cerebras models.
export const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL ?? 'gpt-oss-120b'
