import { Worker, type ConnectionOptions } from 'bullmq'
import { runIngestionAgent } from '../agents/ingestionAgent'
import { runPatternAgent } from '../agents/patternAgent'
import { logger } from '../utils/logger'
import type { IngestJobData } from './jobs/ingestJob'
import type { SourceType } from '../rag/chunker'

// Shared Redis connection config — used by both Queue and Worker
export const redisConnection: ConnectionOptions = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
}

let ingestCount = 0   // trigger pattern agent every 10 ingestions

export function startWorkers(): void {

  // ── Ingest worker ──────────────────────────────────────────────────────
  const ingestWorker = new Worker<IngestJobData>(
    'ingest',
    async (job) => {
      const { complaintId, rawText, source } = job.data
      logger.info(`Processing ingest job ${job.id} — complaint ${complaintId}`)

      await runIngestionAgent(complaintId, rawText, source as SourceType)

      // Every 10 complaints, trigger pattern analysis
      ingestCount++
      if (ingestCount % 10 === 0) {
        const { addPatternJob } = await import('./jobs/patternJob')
        await addPatternJob()
        logger.info('Pattern job triggered after 10 ingestions')
      }
    },
    {
      connection: redisConnection,
      concurrency: 3,
    }
  )

  ingestWorker.on('completed', (job) => {
    logger.info(`Ingest job ${job.id} completed`)
  })

  ingestWorker.on('failed', (job, err) => {
    logger.error(`Ingest job ${job?.id} failed: ${err.message}`)
  })

  // ── Pattern worker ─────────────────────────────────────────────────────
  const patternWorker = new Worker(
    'pattern',
    async (job) => {
      logger.info(`Processing pattern job ${job.id}`)
      await runPatternAgent()
    },
    {
      connection: redisConnection,
      concurrency: 1,   // only one pattern analysis at a time
    }
  )

  patternWorker.on('completed', (job) => {
    logger.info(`Pattern job ${job.id} completed`)
  })

  patternWorker.on('failed', (job, err) => {
    logger.error(`Pattern job ${job?.id} failed: ${err.message}`)
  })

  logger.info('BullMQ workers started (ingest + pattern).')
}
