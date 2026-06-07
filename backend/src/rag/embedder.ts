import { VoyageAIClient } from 'voyageai'
import { logger } from '../utils/logger'

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY ?? '' })
const MODEL = process.env.VOYAGE_EMBED_MODEL ?? 'voyage-3-lite'

interface EmbedResponse {
  data?: { embedding?: number[] }[]
}

export async function getEmbedding(text: string): Promise<number[]> {
  const response = (await voyage.embed({ input: text, model: MODEL })) as EmbedResponse
  logger.debug(`Embedded 1 text — model: ${MODEL}`)
  return response.data?.[0]?.embedding ?? []
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const response = (await voyage.embed({ input: texts, model: MODEL })) as EmbedResponse
  logger.debug(`Embedded ${texts.length} texts (batch) — model: ${MODEL}`)
  return (response.data ?? []).map((d) => d.embedding ?? [])
}
