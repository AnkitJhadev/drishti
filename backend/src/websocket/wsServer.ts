import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { JWT_SECRET, FRONTEND_URL } from '../config'
import { logger } from '../utils/logger'
import type { EnrichedComplaint } from '../types/complaint'
import type { Alert } from '../types/alert'
import type { AIRecommendation, ComplaintCluster } from '../types/ai'
import type { TowerStatus } from '../types/tower'

let io: Server | null = null

export function initWebSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
  })

  // Mandatory JWT auth — the event stream carries every complaint, alert and
  // recommendation, so an unauthenticated socket would be a data leak.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) {
      next(new Error('Authentication required'))
      return
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      ;(socket.data as { operator?: unknown }).operator = payload
      next()
    } catch {
      next(new Error('Token expired or invalid'))
    }
  })

  io.on('connection', (socket) => {
    logger.info(`WS client connected: ${socket.id}`)
    socket.on('disconnect', () => {
      logger.info(`WS client disconnected: ${socket.id}`)
    })
  })

  logger.info('WebSocket server initialized')
}

// ── Typed emitters — exact event names from CLAUDE.md ─────────────────────
function emit(event: string, payload: unknown): void {
  io?.emit(event, payload)
}

export const emitComplaintNew = (complaint: EnrichedComplaint): void =>
  emit('complaint:new', { complaint })

export const emitClusterDetected = (cluster: ComplaintCluster): void =>
  emit('cluster:detected', { cluster })

export const emitRecommendationReady = (recommendation: AIRecommendation): void =>
  emit('recommendation:ready', { recommendation })

export const emitAlertNew = (alert: Alert): void =>
  emit('alert:new', { alert })

export const emitTowerStatusChanged = (tower_id: string, status: TowerStatus): void =>
  emit('tower:status:changed', { tower_id, status })

export const emitTowerAdded = (tower: unknown): void =>
  emit('tower:added', { tower })

export const emitComplaintResolved = (id: string): void =>
  emit('complaint:resolved', { id })
