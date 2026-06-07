import { create } from 'zustand'
import type { Tower, TowerStatus } from '../types/tower'

interface TowersState {
  towers: Tower[]
  loading: boolean
  setTowers: (towers: Tower[]) => void
  updateTowerStatus: (tower_id: string, status: TowerStatus) => void
  setLoading: (loading: boolean) => void
}

export const useTowersStore = create<TowersState>((set) => ({
  towers: [],
  loading: false,
  setTowers: (towers) => set({ towers }),
  updateTowerStatus: (tower_id, status) =>
    set((s) => ({
      towers: s.towers.map((t) => (t.id === tower_id ? { ...t, status } : t)),
    })),
  setLoading: (loading) => set({ loading }),
}))
