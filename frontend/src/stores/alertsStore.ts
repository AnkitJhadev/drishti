import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { Alert } from '../types/alert'

interface AlertsState {
  alerts: Alert[]
  loading: boolean
  setAlerts: (alerts: Alert[]) => void
  addAlert: (alert: Alert) => void
  markRead: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      loading: false,
      setAlerts: (alerts) => set({ alerts }),
      addAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts] })),
      markRead: (id) =>
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
        })),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'drishti-alerts',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ alerts: s.alerts.slice(0, 50) }),
    }
  )
)
