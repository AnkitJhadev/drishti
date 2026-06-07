import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { Tower, TowerStatus } from '../types/tower'

interface TowersState {
  towers: Tower[]
  loading: boolean
  setTowers: (towers: Tower[]) => void
  updateTowerStatus: (tower_id: string, status: TowerStatus) => void
  setLoading: (loading: boolean) => void
}

export const useTowersStore = create<TowersState>()(
  persist(
    (set) => ({
      towers: [],
      loading: false,
      setTowers: (towers) => set({ towers }),
      updateTowerStatus: (tower_id, status) =>
        set((s) => ({
          towers: s.towers.map((t) => (t.id === tower_id ? { ...t, status } : t)),
        })),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'drishti-towers',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ towers: s.towers }),
    }
  )
)
