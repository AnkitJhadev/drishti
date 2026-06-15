import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { EnrichedComplaint } from '../types/complaint'

interface ComplaintsState {
  complaints: EnrichedComplaint[]
  loading: boolean
  // Bumped each time the pattern agent finishes a pass — lets the ingestion
  // panel resolve its "clustering" step on a real signal, not a guess.
  patternTick: number
  setComplaints: (complaints: EnrichedComplaint[]) => void
  addComplaint: (complaint: EnrichedComplaint) => void
  resolveComplaint: (id: string) => void
  failComplaint: (id: string, reason: string) => void
  markPatternComplete: () => void
  setLoading: (loading: boolean) => void
}

export const useComplaintsStore = create<ComplaintsState>()(
  persist(
    (set) => ({
      complaints: [],
      loading: false,
      patternTick: 0,
      setComplaints: (complaints) => set({ complaints }),
      addComplaint: (complaint) =>
        set((s) => {
          // Upsert by id: the ingestion agent re-emits each complaint after
          // classification, so update in place rather than duplicating.
          const idx = s.complaints.findIndex((c) => c.id === complaint.id)
          if (idx === -1) return { complaints: [complaint, ...s.complaints] }
          const next = s.complaints.slice()
          next[idx] = { ...next[idx], ...complaint }
          return { complaints: next }
        }),
      resolveComplaint: (id) =>
        set((s) => ({
          complaints: s.complaints.map((c) => (c.id === id ? { ...c, status: 'resolved' } : c)),
        })),
      failComplaint: (id, reason) =>
        set((s) => ({
          complaints: s.complaints.map((c) =>
            c.id === id ? { ...c, status: 'failed', error: reason } : c
          ),
        })),
      markPatternComplete: () => set((s) => ({ patternTick: s.patternTick + 1 })),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'drishti-complaints',
      storage: createJSONStorage(() => idbStorage),
      // Cache only the most recent 100 for offline view — keeps storage lean.
      partialize: (s) => ({ complaints: s.complaints.slice(0, 100) }),
    }
  )
)
