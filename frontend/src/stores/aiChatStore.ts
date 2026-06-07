import { create } from 'zustand'
import type { ChatMessage, AIRecommendation } from '../types/ai'

interface AIChatState {
  messages: ChatMessage[]
  recommendations: AIRecommendation[]
  loading: boolean
  addMessage: (message: ChatMessage) => void
  addRecommendation: (recommendation: AIRecommendation) => void
  updateRecommendationStatus: (
    id: string,
    status: AIRecommendation['status'],
    operator_note?: string
  ) => void
  setLoading: (loading: boolean) => void
}

export const useAIChatStore = create<AIChatState>((set) => ({
  messages: [],
  recommendations: [],
  loading: false,
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  addRecommendation: (recommendation) =>
    set((s) => ({ recommendations: [recommendation, ...s.recommendations] })),
  updateRecommendationStatus: (id, status, operator_note) =>
    set((s) => ({
      recommendations: s.recommendations.map((r) =>
        r.id === id ? { ...r, status, operator_note } : r
      ),
    })),
  setLoading: (loading) => set({ loading }),
}))
