import { Worker, type ConnectionOptions } from 'bullmq'
import { runIngestionAgent } from '../agents/ingestionAgent'
import { logger } from '../utils/logger'
import type { IngestJobData } from './jobs/ingestJob'
import type { SourceType } from '../rag/chunker'

// Shared Redis connection config — used by both Queue and Worker
export const redisConnection: ConnectionOptions = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
}

// ── Ingestion worker ───────────────────────────────────────────────────────
export function startWorkers(): void {
  const ingestWorker = new Worker<IngestJobData>(
    'ingest',
    async (job) => {
      const { complaintId, rawText, source } = job.data
      logger.info(`Processing ingest job ${job.id} — complaint ${complaintId}`)

      await runIngestionAgent(complaintId, rawText, source as SourceType)
    },
    {
      connection: redisConnection,
      concurrency: 3,    // process up to 3 complaints at once
    }
  )

  ingestWorker.on('completed', (job) => {
    logger.info(`Ingest job ${job.id} completed`)
  })

  ingestWorker.on('failed', (job, err) => {
    logger.error(`Ingest job ${job?.id} failed: ${err.message}`)
  })

  logger.info('BullMQ workers started.')
}
