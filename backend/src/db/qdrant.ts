import { QdrantClient } from '@qdrant/js-client-rest'
import { logger } from '../utils/logger'

export const COLLECTION_NAME = 'drishti_docs'
const VECTOR_SIZE = 512   // voyage-3-lite output dimension

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  ...(process.env.QDRANT_API_KEY ? { apiKey: process.env.QDRANT_API_KEY } : {}),
})

// Creates the collection if it doesn't exist — called on startup
export async function initQdrant(): Promise<void> {
  try {
    const collections = await qdrant.getCollections()
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME)

    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      })
      logger.info(`Qdrant collection "${COLLECTION_NAME}" created.`)
    } else {
      logger.info(`Qdrant collection "${COLLECTION_NAME}" already exists.`)
    }
  } catch (err) {
    logger.error(`Qdrant init error: ${String(err)}`)
    throw err
  }
}
