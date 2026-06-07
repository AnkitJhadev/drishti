import { useEffect } from 'react'
import api from '../services/api'
import { useAIChatStore } from '../stores/aiChatStore'
import type { AIRecommendation } from '../types/ai'

interface RecsResponse {
  recommendations: AIRecommendation[]
}

export function useRecommendations(): void {
  const setRecommendations = useAIChatStore((s) => s.setRecommendations)

  useEffect(() => {
    let active = true
    api
      .get<RecsResponse>('/recommendations', { params: { status: 'pending' } })
      .then(({ data }) => {
        if (active) setRecommendations(data.recommendations)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [setRecommendations])
}
