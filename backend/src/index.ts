import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { logger } from './utils/logger'

const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000', credentials: true }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'drishti-backend' })
})

const PORT = process.env.PORT ?? 4000

httpServer.listen(PORT, () => {
  logger.info(`Drishti backend running on port ${PORT}`)
})
