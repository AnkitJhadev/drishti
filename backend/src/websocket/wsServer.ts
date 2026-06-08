import { Server } from 'socket.io'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger'
import type { EnrichedComplaint } from '../types/complaint'
import type { Alert } from '../types/alert'
import type { AIRecommendation, ComplaintCluster } from '../types/ai'
import type { TowerStatus } from '../types/tower'

let io: Server | null = null

export function initWebSocket(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    },
  })

  // Optional JWT auth — allow connection but log identity if provided
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret')
        ;(socket.data as { operator?: unknown }).operator = payload
      } catch {
        // invalid token — still allow connection for demo resilience
      }
    }
    next()
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
