import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'
import type { Alert } from '../types/alert'

interface AlertsState {
  alerts: Alert[]
  unreadCount: number
  loading: boolean
  setAlerts: (alerts: Alert[]) => void
  setUnreadCount: (count: number) => void
  addAlert: (alert: Alert) => void
  markRead: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      unreadCount: 0,
      loading: false,
      setAlerts: (alerts) => set({ alerts }),
      setUnreadCount: (count) => set({ unreadCount: count }),
      addAlert: (alert) =>
        set((s) => {
          // Upsert by id — dedupe re-delivered alert:new events so the badge
          // reflects real alert count, not how many socket events arrived.
          if (s.alerts.some((a) => a.id === alert.id)) return s
          return {
            alerts: [alert, ...s.alerts],
            unreadCount: alert.read ? s.unreadCount : s.unreadCount + 1,
          }
        }),
      markRead: (id) =>
        set((s) => {
          const target = s.alerts.find((a) => a.id === id)
          if (!target || target.read) return s
          return {
            alerts: s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
            unreadCount: Math.max(0, s.unreadCount - 1),
          }
        }),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'drishti-alerts',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ alerts: s.alerts.slice(0, 50), unreadCount: s.unreadCount }),
    }
  )
)
