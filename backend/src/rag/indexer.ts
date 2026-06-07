import { v4 as uuidv4 } from 'uuid'
import { qdrant, COLLECTION_NAME } from '../db/qdrant'
import { getEmbeddingsBatch } from './embedder'
import { chunkDocument, type SourceType } from './chunker'
import { logger } from '../utils/logger'

export interface IndexPayload {
  text: string
  source_id: string        // complaint UUID
  source_type: SourceType
  location_hint: string
  chunk_index: number
}

export async function indexComplaint(
  complaintId: string,
  text: string,
  sourceType: SourceType,
  locationHint: string
): Promise<void> {
  const chunks = chunkDocument(text, sourceType)

  if (chunks.length === 0) {
    logger.warn(`No chunks generated for complaint ${complaintId}`)
    return
  }

  // Batch embed all chunks in one API call
  const embeddings = await getEmbeddingsBatch(chunks.map((c) => c.text))

  const points = chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: embeddings[i],
    payload: {
      text: chunk.text,
      source_id: complaintId,
      source_type: sourceType,
      location_hint: locationHint,
      chunk_index: chunk.chunkIndex,
    } satisfies IndexPayload,
  }))

  await qdrant.upsert(COLLECTION_NAME, { points })

  logger.info(`Indexed ${points.length} chunks for complaint ${complaintId}`)
}
