import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { ChatMessage, AIRecommendation } from '../types/ai'

interface AIChatState {
  messages: ChatMessage[]
  recommendations: AIRecommendation[]
  loading: boolean
  addMessage: (message: ChatMessage) => void
  setRecommendations: (recommendations: AIRecommendation[]) => void
  addRecommendation: (recommendation: AIRecommendation) => void
  updateRecommendationStatus: (
    id: string,
    status: AIRecommendation['status'],
    operator_note?: string
  ) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set) => ({
      messages: [],
      recommendations: [],
      loading: false,
      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),
      setRecommendations: (recommendations) => set({ recommendations }),
      addRecommendation: (recommendation) =>
        set((s) => {
          // Upsert by id — the pattern agent re-emits recommendation:ready on
          // every run, so a blind prepend would pile up duplicates (inflating
          // the Approvals badge well past the real DB count).
          const idx = s.recommendations.findIndex((r) => r.id === recommendation.id)
          if (idx === -1) return { recommendations: [recommendation, ...s.recommendations] }
          const next = s.recommendations.slice()
          next[idx] = { ...next[idx], ...recommendation }
          return { recommendations: next }
        }),
      updateRecommendationStatus: (id, status, operator_note) =>
        set((s) => ({
          recommendations: s.recommendations.map((r) =>
            r.id === id ? { ...r, status, operator_note } : r
          ),
        })),
      setLoading: (loading) => set({ loading }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'drishti-ai-chat',
      storage: createJSONStorage(() => idbStorage),
      // Cache AI responses + recommendations locally so they survive reloads
      // and remain readable offline. `loading` is transient — never persisted.
      partialize: (s) => ({ messages: s.messages, recommendations: s.recommendations }),
    }
  )
)
