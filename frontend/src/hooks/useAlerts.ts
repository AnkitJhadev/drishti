import { useEffect } from 'react'
import api from '../services/api'
import { useAlertsStore } from '../stores/alertsStore'
import type { Alert } from '../types/alert'

interface AlertsResponse {
  alerts: Alert[]
  unread_count: number
}

export function useAlerts(): void {
  const setAlerts = useAlertsStore((s) => s.setAlerts)
  const setUnreadCount = useAlertsStore((s) => s.setUnreadCount)
  const setLoading = useAlertsStore((s) => s.setLoading)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .get<AlertsResponse>('/alerts')
      .then(({ data }) => {
        if (active) {
          setAlerts(data.alerts)
          setUnreadCount(data.unread_count)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [setAlerts, setUnreadCount, setLoading])
}
