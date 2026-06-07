import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { logger } from './utils/logger'
import { runMigrations } from './db/postgres'
import { initQdrant } from './db/qdrant'
import { seedTowers } from './db/seed'
import { seedOperator } from './db/seedOperator'
import { startWorkers } from './queue/worker'
import { errorHandler } from './middleware/errorHandler'
import authRouter from './routes/auth'
import ingestRouter from './routes/ingest'

const app = express()
const httpServer = createServer(app)

// ── Middleware ───────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true }))
app.use(express.json())

// ── Routes ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drishti-backend' })
})

app.use('/auth', authRouter)
app.use('/ingest', ingestRouter)

// ── Global error handler (must be last) ─────────────────
app.use(errorHandler)

// ── Bootstrap ────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000

async function bootstrap(): Promise<void> {
  await runMigrations()       // create all tables
  await initQdrant()          // create vector collection
  await seedTowers()          // 20 mock towers
  await seedOperator()        // default admin
  startWorkers()              // BullMQ workers (async, non-blocking)

  httpServer.listen(PORT, () => {
    logger.info(`Drishti backend running on port ${PORT}`)
  })
}

bootstrap().catch((err: unknown) => {
  logger.error(`Fatal startup error: ${String(err)}`)
  process.exit(1)
})
