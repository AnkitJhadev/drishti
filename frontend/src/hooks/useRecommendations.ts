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
    // Load both pending (to approve) and approved (in progress, to resolve)
    Promise.all([
      api.get<RecsResponse>('/recommendations', { params: { status: 'pending' } }),
      api.get<RecsResponse>('/recommendations', { params: { status: 'approved' } }),
    ])
      .then(([p, a]) => {
        if (active) setRecommendations([...p.data.recommendations, ...a.data.recommendations])
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [setRecommendations])
}
