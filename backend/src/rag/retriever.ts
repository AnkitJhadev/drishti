import { qdrant, COLLECTION_NAME } from '../db/qdrant'
import { getEmbedding } from './embedder'
import type { IndexPayload } from './indexer'
import { logger } from '../utils/logger'

export interface RetrievedChunk {
  text: string
  source_id: string
  source_type: string
  location_hint: string
  score: number
}

export async function retrieveRelevant(
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  const queryVector = await getEmbedding(query)

  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  })

  logger.debug(`RAG retrieved ${results.length} chunks for query: "${query.slice(0, 60)}..."`)

  return results.map((r) => {
    const p = r.payload as unknown as IndexPayload
    return {
      text: p.text,
      source_id: p.source_id,
      source_type: p.source_type,
      location_hint: p.location_hint,
      score: r.score,
    }
  })
}
