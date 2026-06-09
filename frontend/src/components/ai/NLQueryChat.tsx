import { useState, useRef, useEffect, type FormEvent } from 'react'
import ChatMessage from './ChatMessage'
import { useAIChatStore } from '../../stores/aiChatStore'
import { useComplaintsStore } from '../../stores/complaintsStore'
import api from '../../services/api'

interface ChatResponse {
  answer: string
  map_highlights: string[]
  chart_data: Record<string, number> | null
}

// In-browser embedding cache (complaint id → vector) for offline search.
const localVecCache = new Map<string, number[]>()

const SUGGESTIONS = [
  'Which towers are critical?',
  'Show complaint breakdown by issue type',
  'Summarize active incident clusters',
]

export default function NLQueryChat() {
  const messages = useAIChatStore((s) => s.messages)
  const addMessage = useAIChatStore((s) => s.addMessage)
  const loading = useAIChatStore((s) => s.loading)
  const setLoading = useAIChatStore((s) => s.setLoading)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    })
    setInput('')
    setLoading(true)

    // Offline → run semantic search on-device (ONNX Runtime Web + WASM in the
    // browser, no backend). Online path below is unchanged.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        const { embedText, cosineSim } = await import('../../services/localEmbedder')
        const complaints = useComplaintsStore.getState().complaints
        let content: string
        if (complaints.length === 0) {
          content = 'Offline — no cached complaints to search on-device yet.'
        } else {
          const qVec = await embedText(trimmed)
          const scored = [] as { text: string; meta: string; score: number }[]
          for (const c of complaints.slice(0, 100)) {
            let vec = localVecCache.get(c.id)
            if (!vec) {
              vec = await embedText(c.raw_text)
              localVecCache.set(c.id, vec)
            }
            scored.push({
              text: c.raw_text,
              meta: `${c.issue_type ?? 'unknown'} · ${c.severity ?? '—'}${c.location_hint ? ` · ${c.location_hint}` : ''}`,
              score: cosineSim(qVec, vec),
            })
          }
          scored.sort((a, b) => b.score - a.score)
          content =
            'On-device semantic search (offline) — top matches:\n\n' +
            scored
              .slice(0, 5)
              .map((s, i) => `${i + 1}. [${s.meta}] ${s.text.slice(0, 120)}`)
              .join('\n')
        }
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content, timestamp: new Date().toISOString() })
      } catch {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            'Offline on-device search is unavailable — the model isn’t cached yet. Use the assistant once while online to enable offline mode.',
          timestamp: new Date().toISOString(),
        })
      } finally {
        setLoading(false)
      }
      return
    }

    try {
      const { data } = await api.post<ChatResponse>('/ai/chat', { message: trimmed })
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date().toISOString(),
        map_highlights: data.map_highlights?.length ? data.map_highlights : undefined,
        chart_data: data.chart_data ?? undefined,
      })
    } catch {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I could not process that request. Please try again.',
        timestamp: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  return (
    <div className="dr-panel h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #1f2937' }}>
        <span style={{ color: '#f59e0b' }}>✦</span>
        <span className="dr-title">Ask Drishti</span>
        <span className="text-xs" style={{ color: '#6b7280' }}>
          AI network assistant
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <p className="text-xs" style={{ color: '#6b7280' }}>
              Ask anything about your network
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center px-4">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="px-3 py-2 rounded-lg text-sm" style={{ background: '#1a2235', color: '#9ca3af' }}>
              <span className="animate-pulse">Drishti is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 p-3 shrink-0" style={{ borderTop: '1px solid #1f2937' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Drishti anything about your network..."
          className="flex-1 px-3 py-2 rounded text-sm outline-none"
          style={{ background: '#0a0f1e', border: '1px solid #1f2937', color: '#f9fafb' }}
          onFocus={(e) => (e.target.style.borderColor = '#f59e0b')}
          onBlur={(e) => (e.target.style.borderColor = '#1f2937')}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded text-sm font-semibold transition-opacity disabled:opacity-40"
          style={{ background: '#f59e0b', color: '#0a0f1e' }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
