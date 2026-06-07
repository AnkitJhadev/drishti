import { useEffect } from 'react'
import api from '../services/api'
import { useTowersStore } from '../stores/towersStore'
import type { Tower } from '../types/tower'

interface TowersResponse {
  towers: Tower[]
}

export function useTowers(): void {
  const setTowers = useTowersStore((s) => s.setTowers)
  const setLoading = useTowersStore((s) => s.setLoading)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get<TowersResponse>('/towers')
      .then(({ data }) => {
        if (active) setTowers(data.towers)
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [setTowers, setLoading])
}
