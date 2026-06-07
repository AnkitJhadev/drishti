import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { EnrichedComplaint } from '../types/complaint'

interface ComplaintsState {
  complaints: EnrichedComplaint[]
  loading: boolean
  setComplaints: (complaints: EnrichedComplaint[]) => void
  addComplaint: (complaint: EnrichedComplaint) => void
  resolveComplaint: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useComplaintsStore = create<ComplaintsState>()(
  persist(
    (set) => ({
      complaints: [],
      loading: false,
      setComplaints: (complaints) => set({ complaints }),
      addComplaint: (complaint) =>
        set((s) => ({ complaints: [complaint, ...s.complaints] })),
      resolveComplaint: (id) =>
        set((s) => ({
          complaints: s.complaints.map((c) => (c.id === id ? { ...c, status: 'resolved' } : c)),
        })),
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
