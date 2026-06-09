// On-device embeddings via Transformers.js (ONNX Runtime Web + WASM).
//
// This runs the SAME model as the backend (all-MiniLM-L6-v2, 384-dim) but
// entirely in the browser — no backend request. The ~30MB model downloads on
// first use and is cached (browser HTTP cache + service worker) for offline use.
//
// Loaded lazily (dynamic import) so it never touches the initial bundle, and
// fully isolated: nothing on the critical path imports this. Used only as an
// offline fallback for semantic search.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExtractor(): Promise<any> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      // Browser: pull weights from the HF CDN and cache them.
      env.allowLocalModels = false
      return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    })()
  }
  return extractorPromise
}

/** Embed one string into a 384-dim, L2-normalised sentence vector, in-browser. */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array)
}

/** Cosine similarity of two equal-length vectors (both already L2-normalised). */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}
