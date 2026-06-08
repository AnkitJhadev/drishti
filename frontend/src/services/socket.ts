import { io, Socket } from 'socket.io-client'
import { useComplaintsStore } from '../stores/complaintsStore'
import { useAlertsStore } from '../stores/alertsStore'
import { useAIChatStore } from '../stores/aiChatStore'
import { useTowersStore } from '../stores/towersStore'
import { useConnectionStore } from '../stores/connectionStore'
import { flushQueue } from './actionQueue'
import type { EnrichedComplaint } from '../types/complaint'
import type { Alert } from '../types/alert'
import type { AIRecommendation } from '../types/ai'
import type { Tower, TowerStatus } from '../types/tower'

let socket: Socket | null = null

export function connectSocket(token: string): void {
  if (socket?.connected) return

  socket = io(import.meta.env.VITE_API_URL ?? 'http://localhost:4000', {
    auth: { token },
    transports: ['websocket'],
  })

  // Real connection state for the LIVE indicator
  socket.on('connect', () => {
    useConnectionStore.getState().setConnected(true)
    void flushQueue() // replay any actions queued while offline
  })
  socket.on('disconnect', () => useConnectionStore.getState().setConnected(false))
  socket.on('connect_error', () => useConnectionStore.getState().setConnected(false))

  socket.on('complaint:new', (data: { complaint: EnrichedComplaint }) => {
    useComplaintsStore.getState().addComplaint(data.complaint)
  })

  socket.on('alert:new', (data: { alert: Alert }) => {
    useAlertsStore.getState().addAlert(data.alert)
  })

  socket.on('recommendation:ready', (data: { recommendation: AIRecommendation }) => {
    useAIChatStore.getState().addRecommendation(data.recommendation)
  })

  socket.on('tower:status:changed', (data: { tower_id: string; status: TowerStatus }) => {
    useTowersStore.getState().updateTowerStatus(data.tower_id, data.status)
  })

  socket.on('tower:added', (data: { tower: Tower }) => {
    useTowersStore.getState().addTower(data.tower)
  })

  socket.on('complaint:resolved', (data: { id: string }) => {
    useComplaintsStore.getState().resolveComplaint(data.id)
  })
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
  useConnectionStore.getState().setConnected(false)
}
