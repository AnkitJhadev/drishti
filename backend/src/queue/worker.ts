import { Worker, type ConnectionOptions } from 'bullmq'
import IORedis from 'ioredis'
import { runIngestionAgent } from '../agents/ingestionAgent'
import { runPatternAgent } from '../agents/patternAgent'
import { prisma } from '../db/prisma'
import { emitComplaintFailed, emitPatternComplete } from '../websocket/wsServer'
import { logger } from '../utils/logger'
import type { IngestJobData } from './jobs/ingestJob'
import type { SourceType } from '../rag/chunker'

// A 429 from any LLM provider means the daily/burst quota is gone — tell the
// operator that specifically rather than a generic "something broke".
function failureReason(message: string): string {
  if (/rate.?limit|429|quota|too many requests|tokens per day|tpd/i.test(message)) {
    return 'AI service quota reached — this complaint could not be auto-classified. Try again later.'
  }
  return 'Auto-classification failed after several retries. Try re-uploading this complaint.'
}

// Shared Redis connection — used by both Queue and Worker.
// maxRetriesPerRequest: null is REQUIRED by BullMQ.
// rediss:// URLs (Upstash) enable TLS automatically.
// Cast resolves a harmless ioredis version-dedupe type mismatch with bullmq.
export const redisConnection = new IORedis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Upstash closes idle connections — reconnect automatically
    retryStrategy: (times) => Math.min(times * 500, 5000),
    reconnectOnError: () => true,
    // Keep TCP alive so Upstash doesn't drop the idle socket
    keepAlive: 10000,
    connectTimeout: 15000,
  }
) as unknown as ConnectionOptions

export function startWorkers(): void {

  // ── Ingest worker ──────────────────────────────────────────────────────
  const ingestWorker = new Worker<IngestJobData>(
    'ingest',
    async (job) => {
      const { complaintId, rawText, source } = job.data
      logger.info(`Processing ingest job ${job.id} — complaint ${complaintId}`)

      await runIngestionAgent(complaintId, rawText, source as SourceType)

      // Debounced: schedule a pattern pass ~8s after the last ingestion settles,
      // so clustering runs once on the whole classified batch (and after the
      // Groq rate-limiter has freed up from classification).
      const { addPatternJob } = await import('./jobs/patternJob')
      await addPatternJob(8000)
    },
    {
      connection: redisConnection,
      concurrency: 1, // serial — free LLM tiers have low rate limits
      limiter: { max: 4, duration: 60_000 }, // ≤4 complaints/min (Groq free TPM)
    }
  )

  ingestWorker.on('completed', (job) => {
    logger.info(`Ingest job ${job.id} completed`)
  })

  ingestWorker.on('failed', (job, err) => {
    logger.error(`Ingest job ${job?.id} failed: ${err.message}`)
    if (!job) return

    // BullMQ fires this on every attempt; only act once all retries are spent,
    // otherwise we'd mark a complaint failed that's about to succeed on retry.
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1)
    if (!exhausted) return

    const { complaintId } = job.data
    const reason = failureReason(err.message)
    void (async () => {
      try {
        // Don't clobber a complaint that actually progressed past classification.
        // JSONB merge (|| operator) → use parameterized raw SQL via Prisma.
        const meta = JSON.stringify({ error: reason, failed_at: new Date().toISOString() })
        await prisma.$executeRaw`
          UPDATE complaints
             SET status = 'failed',
                 metadata = COALESCE(metadata, '{}'::jsonb) || ${meta}::jsonb
           WHERE id = ${complaintId}::uuid
             AND status IN ('pending', 'processing')`
        emitComplaintFailed(complaintId, reason)
        logger.warn(`Complaint ${complaintId} marked failed — ${reason}`)
      } catch (e) {
        logger.error(`Could not mark complaint ${complaintId} failed: ${String(e)}`)
      }
    })()
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
    emitPatternComplete(true)
  })

  patternWorker.on('failed', (job, err) => {
    logger.error(`Pattern job ${job?.id} failed: ${err.message}`)
    // Tell the UI to stop waiting once retries are spent (e.g. LLM quota gone),
    // so the ingestion panel resolves instead of spinning forever.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) emitPatternComplete(false)
  })

  logger.info('BullMQ workers started (ingest + pattern).')
}
