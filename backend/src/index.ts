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
import complaintsRouter from './routes/complaints'
import towersRouter from './routes/towers'
import alertsRouter from './routes/alerts'
import recommendationsRouter from './routes/recommendations'

const app = express()
const httpServer = createServer(app)

// ── Middleware ───────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true }))
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

// ── Global error handler (must be last) ─────────────────
app.use(errorHandler)

// ── Bootstrap ────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000

async function bootstrap(): Promise<void> {
  await runMigrations()
  await initQdrant()
  await seedTowers()
  await seedOperator()
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
