import './env'   // MUST be first — loads root .env before any other module
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { FRONTEND_URL } from './config'
import { logger } from './utils/logger'
import pool from './db/postgres'
import { prisma } from './db/prisma'
import { runMigrations } from './db/postgres'
import { initQdrant } from './db/qdrant'
import { seedTowers } from './db/seed'
import { seedOperator } from './db/seedOperator'
import { startWorkers } from './queue/worker'
import { initWebSocket } from './websocket/wsServer'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import ingestRouter from './routes/ingest'
import complaintsRouter from './routes/complaints'
import towersRouter from './routes/towers'
import alertsRouter from './routes/alerts'
import recommendationsRouter from './routes/recommendations'
import aiRouter from './routes/ai'
import ontologyRouter from './routes/ontology'

const app = express()
const httpServer = createServer(app)

// ── Middleware ───────────────────────────────────────────
// One reverse-proxy hop (Caddy) in front of us in prod — needed so req.ip is
// the client (rate limiting keys on it), not the proxy.
app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())

// ── Routes ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drishti-backend' })
})

app.use('/auth',            authRouter)
app.use('/ingest',          ingestRouter)
app.use('/complaints',      complaintsRouter)
app.use('/towers',          towersRouter)
app.use('/alerts',          alertsRouter)
app.use('/recommendations', recommendationsRouter)
app.use('/ai',              aiRouter)
app.use('/ontology',        ontologyRouter)

// ── Global error handler (must be last) ─────────────────
app.use(errorHandler)

// ── Bootstrap ────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000

async function bootstrap(): Promise<void> {
  await runMigrations()
  await initQdrant()
  await seedTowers()
  await seedOperator()
  initWebSocket(httpServer)
  startWorkers()

  httpServer.listen(PORT, () => {
    logger.info(`Drishti backend running on port ${PORT}`)
    logger.info(`Routes: /health /auth /ingest /complaints /towers /alerts /recommendations`)
  })
}

bootstrap().catch((err: unknown) => {
  logger.error(`Fatal startup error: ${String(err)}`)
  process.exit(1)
})

// ── Process-level safety nets ────────────────────────────
// A stray async error must surface in the logs, not vanish — and under
// Docker's `restart: unless-stopped` an explicit exit gives a clean restart.
process.on('unhandledRejection', (reason: unknown) => {
  logger.error(`Unhandled rejection: ${String(reason)}`)
})

process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught exception: ${err.stack ?? err.message}`)
  process.exit(1)
})

// Graceful shutdown — `docker stop` sends SIGTERM; finish in-flight requests
// and close DB pools instead of dropping them.
function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`)
  httpServer.close(() => {
    void Promise.allSettled([prisma.$disconnect(), pool.end()]).then(() => process.exit(0))
  })
  // Hard exit if connections refuse to drain (Docker's own kill timeout is 10s)
  setTimeout(() => process.exit(1), 8000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
