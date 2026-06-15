import type { ParsedRecord } from '../workers/fileParser.worker'

export type { ParsedRecord }

export function workersSupported(): boolean {
  return typeof Worker !== 'undefined'
}

function kindOf(file: File): 'csv' | 'json' | 'pdf' | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (n.endsWith('.json') || file.type === 'application/json') return 'json'
  if (n.endsWith('.csv') || file.type === 'text/csv') return 'csv'
  return null
}

let seq = 0

// Parse a file in a Web Worker (off the main thread). Resolves to records;
// onProgress(0..1) fires as parsing advances. Throws on unsupported/parse error.
export function parseFileInWorker(
  file: File,
  onProgress?: (value: number) => void
): Promise<ParsedRecord[]> {
  const kind = kindOf(file)
  if (!kind) return Promise.reject(new Error(`Unsupported file type: ${file.name}`))

  return new Promise<ParsedRecord[]>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/fileParser.worker.ts', import.meta.url), { type: 'module' })
    const id = ++seq

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'progress') onProgress?.(m.value)
      else if (m.type === 'done') { resolve(m.records); worker.terminate() }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate() }
    }
    worker.onerror = (err) => { reject(new Error(err.message)); worker.terminate() }

    file.arrayBuffer().then((buffer) => {
      worker.postMessage({ id, fileName: file.name, kind, buffer }, [buffer])
    }).catch(reject)
  })
}
