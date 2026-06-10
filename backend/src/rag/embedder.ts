import { logger } from '../utils/logger'

// Embeddings run fully locally — free, offline, no rate limits, no API key.
const LOCAL_MODEL = process.env.EMBED_MODEL ?? 'Xenova/all-MiniLM-L6-v2' // 384-dim

// ── Local embeddings via Transformers.js ──────────────────────────────────
// @xenova/transformers is ESM-only; this Function-based import survives the
// CommonJS transpile (TS would otherwise rewrite import() to require()).
const importESM = new Function('m', 'return import(m)') as (m: string) => Promise<{ pipeline: unknown }>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      logger.info(`Loading local embedding model "${LOCAL_MODEL}" (first run downloads ~30MB)…`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { pipeline } = (await importESM('@xenova/transformers')) as any
      const ex = await pipeline('feature-extraction', LOCAL_MODEL)
      logger.info('Local embedding model ready.')
      return ex
    })()
  }
  return extractorPromise
}

async function localBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor()
  // mean pooling + L2 normalize → sentence embeddings
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  return output.tolist() as number[][]
}

// ── Public API ────────────────────────────────────────────────────────────
export async function getEmbedding(text: string): Promise<number[]> {
  const [vec] = await getEmbeddingsBatch([text])
  return vec ?? []
}

export async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  logger.debug(`Embedded ${texts.length} texts (local)`)
  return localBatch(texts)
}
