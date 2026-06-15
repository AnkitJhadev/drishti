import './env'   // MUST be first — loads root .env before any other module
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { logger } from './utils/logger'
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
app.use('/ai',              aiRouter)
app.use('/ontology',        ontologyRouter)

// ── Global error handler (must be last) ─────────────────
app.use(errorHandler)

// ── Bootstrap ────────────────────────────────────────────
const PORT = process.env.PORT ?? 4000

async function checkConnections(): Promise<void> {
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  logger.info('  Drishti — checking cloud service connections')
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 1. PostgreSQL (Neon) — retry once; free tier cold-starts can take ~10s
  try {
    const { query } = await import('./db/postgres')
    let rows: { version: string }[] = []
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        rows = await query<{ version: string }>('SELECT version()')
        break
      } catch (e) {
        if (attempt === 2) throw e
        logger.warn(`  ⏳  PostgreSQL (Neon)   — cold start, retrying in 5s…`)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
    const ver = rows[0].version.split(' ').slice(0, 2).join(' ')
    logger.info(`  ✅  PostgreSQL (Neon)   — connected  [${ver}]`)
  } catch (e) {
    logger.error(`  ❌  PostgreSQL (Neon)   — FAILED: ${String(e)}`)
    throw e
  }

  // 2. Redis (Upstash)
  try {
    const IORedis = (await import('ioredis')).default
    const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 8000,
    })
    const pong = await redis.ping()
    redis.disconnect()
    logger.info(`  ✅  Redis    (Upstash)  — connected  [${pong}]`)
  } catch (e) {
    logger.error(`  ❌  Redis    (Upstash)  — FAILED: ${String(e)}`)
    throw e
  }

  // 3. Qdrant Cloud
  try {
    const { QdrantClient } = await import('@qdrant/js-client-rest')
    const qdrant = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    })
    await qdrant.getCollections()
    logger.info(`  ✅  Qdrant   (Cloud)    — connected`)
  } catch (e) {
    logger.error(`  ❌  Qdrant   (Cloud)    — FAILED: ${String(e)}`)
    throw e
  }

  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

async function bootstrap(): Promise<void> {
  await checkConnections()
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
