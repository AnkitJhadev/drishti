import OpenAI from 'openai'

// Groq — OpenAI-compatible, free tier, fast. Primary provider.
export const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
})

export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
