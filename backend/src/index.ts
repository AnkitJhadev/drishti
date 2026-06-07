import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { logger } from './utils/logger'
import { runMigrations } from './db/postgres'
import { seedTowers } from './db/seed'

const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drishti-backend' })
})

const PORT = process.env.PORT ?? 4000

async function bootstrap(): Promise<void> {
  // 1. Run SQL migrations (creates all tables if they don't exist)
  await runMigrations()

  // 2. Seed 20 mock towers if the table is empty
  await seedTowers()

  // 3. Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info(`Drishti backend running on port ${PORT}`)
  })
}

bootstrap().catch((err: unknown) => {
  logger.error(`Fatal startup error: ${String(err)}`)
  process.exit(1)
})
