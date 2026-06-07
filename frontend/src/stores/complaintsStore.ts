import { create } from 'zustand'
import type { EnrichedComplaint } from '../types/complaint'

interface ComplaintsState {
  complaints: EnrichedComplaint[]
  loading: boolean
  setComplaints: (complaints: EnrichedComplaint[]) => void
  addComplaint: (complaint: EnrichedComplaint) => void
  resolveComplaint: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useComplaintsStore = create<ComplaintsState>((set) => ({
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
}))
