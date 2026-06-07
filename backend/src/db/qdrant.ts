import { QdrantClient } from '@qdrant/js-client-rest'
import { logger } from '../utils/logger'

export const COLLECTION_NAME = 'drishti_docs'
// Local all-MiniLM-L6-v2 = 384; Voyage voyage-3-lite = 512. Set EMBED_DIM to match.
const VECTOR_SIZE = Number(process.env.EMBED_DIM ?? 384)

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  ...(process.env.QDRANT_API_KEY ? { apiKey: process.env.QDRANT_API_KEY } : {}),
})

async function createCollection(): Promise<void> {
  await qdrant.createCollection(COLLECTION_NAME, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
  })
  logger.info(`Qdrant collection "${COLLECTION_NAME}" created (dim ${VECTOR_SIZE}).`)
}

// Creates the collection; recreates it if the vector dimension changed.
export async function initQdrant(): Promise<void> {
  try {
    const collections = await qdrant.getCollections()
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME)

    if (!exists) {
      await createCollection()
      return
    }

    // Check existing vector size; recreate if it no longer matches.
    const info = await qdrant.getCollection(COLLECTION_NAME)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingSize = (info as any)?.config?.params?.vectors?.size
    if (existingSize && existingSize !== VECTOR_SIZE) {
      logger.warn(`Qdrant dim mismatch (${existingSize} → ${VECTOR_SIZE}); recreating collection.`)
      await qdrant.deleteCollection(COLLECTION_NAME)
      await createCollection()
    } else {
      logger.info(`Qdrant collection "${COLLECTION_NAME}" already exists (dim ${existingSize}).`)
    }
  } catch (err) {
    logger.error(`Qdrant init error: ${String(err)}`)
    throw err
  }
}
