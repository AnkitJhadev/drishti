import { GoogleGenerativeAI } from '@google/generative-ai'

// Google Gemini — free tier. Used for vision (image complaints) and as a
// plain-text fallback. (Tool-calling agents use the OpenAI-compatible path.)
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-1.5-flash'
const TEXT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash'

// Extract complaint text from an image.
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  const model = genai.getGenerativeModel({ model: VISION_MODEL })
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } },
  ])
  return result.response.text().trim()
}

// Plain text completion (no tools) — used as a text fallback.
export async function geminiText(systemPrompt: string, userMessage: string): Promise<string> {
  const model = genai.getGenerativeModel({ model: TEXT_MODEL, systemInstruction: systemPrompt })
  const result = await model.generateContent(userMessage)
  return result.response.text().trim()
}
