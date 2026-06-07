// eslint-disable-next-line @typescript-eslint/no-require-imports
const VoyageAI = require('voyageai')
import { logger } from '../utils/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const voyage = new VoyageAI.default({ apiKey: process.env.VOYAGE_API_KEY ?? '' })
const MODEL = process.env.VOYAGE_EMBED_MODEL ?? 'voyage-3-lite'

export async function getEmbedding(text: string): Promise<number[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await voyage.embed({ input: text, model: MODEL }) as any
  logger.debug(`Embedded 1 text — model: ${MODEL}`)
  return response.data[0].embedding as number[]
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await voyage.embed({ input: texts, model: MODEL }) as any
  logger.debug(`Embedded ${texts.length} texts (batch) — model: ${MODEL}`)
  return response.data.map((d: { embedding: number[] }) => d.embedding)
}
