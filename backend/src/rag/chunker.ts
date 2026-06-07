// Document-aware hybrid chunking strategy (as defined in CLAUDE.md)
// SMS/email (<150 words)  → whole text = 1 chunk
// CSV                     → 1 row = 1 chunk (handled upstream)
// PDF short (<300 words)  → sentence chunking
// PDF long                → detect section headings, then sentence chunk each section
// Default                 → sentence chunking
// Sentence chunk params: maxTokens=200, overlap=50 (approx by word count)

export type SourceType = 'sms' | 'email' | 'csv' | 'pdf' | 'image'

export interface Chunk {
  text: string
  chunkIndex: number
}

const MAX_WORDS = 200
const OVERLAP_WORDS = 50

// Split text into sentences (simple but effective for complaint text)
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Word count approximation
function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

// Sentence chunking with sliding window overlap
function sentenceChunk(text: string): string[] {
  const sentences = splitSentences(text)
  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const sentence of sentences) {
    const sWords = wordCount(sentence)

    if (currentWords + sWords > MAX_WORDS && current.length > 0) {
      chunks.push(current.join(' '))

      // Keep last OVERLAP_WORDS worth of sentences for context
      const overlap: string[] = []
      let overlapWords = 0
      for (let i = current.length - 1; i >= 0; i--) {
        const w = wordCount(current[i])
        if (overlapWords + w > OVERLAP_WORDS) break
        overlap.unshift(current[i])
        overlapWords += w
      }
      current = overlap
      currentWords = overlapWords
    }

    current.push(sentence)
    currentWords += sWords
  }

  if (current.length > 0) chunks.push(current.join(' '))
  return chunks
}

// Detect section headings in long PDFs (ALL CAPS lines or lines ending with ':')
function splitByHeadings(text: string): string[] {
  const lines = text.split('\n')
  const sections: string[] = []
  let current = ''

  for (const line of lines) {
    const trimmed = line.trim()
    const isHeading =
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80) ||
      trimmed.endsWith(':')

    if (isHeading && current.trim().length > 0) {
      sections.push(current.trim())
      current = trimmed + '\n'
    } else {
      current += line + '\n'
    }
  }

  if (current.trim()) sections.push(current.trim())
  return sections.filter((s) => s.length > 0)
}

// ── Main export ───────────────────────────────────────────────────────────
export function chunkDocument(text: string, sourceType: SourceType): Chunk[] {
  const words = wordCount(text)
  let rawChunks: string[]

  if (sourceType === 'sms' || sourceType === 'email' || words < 150) {
    // Short text — whole thing is one chunk
    rawChunks = [text.trim()]
  } else if (sourceType === 'pdf' && words >= 300) {
    // Long PDF — split by headings first, then sentence chunk each section
    const sections = splitByHeadings(text)
    rawChunks = sections.flatMap((section) =>
      wordCount(section) > MAX_WORDS ? sentenceChunk(section) : [section]
    )
  } else {
    // PDF short or image — sentence chunking
    rawChunks = sentenceChunk(text)
  }

  return rawChunks
    .filter((c) => c.trim().length > 10)
    .map((text, chunkIndex) => ({ text: text.trim(), chunkIndex }))
}
