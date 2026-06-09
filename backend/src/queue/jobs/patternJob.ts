import { Queue } from 'bullmq'
import { redisConnection } from '../worker'

export const patternQueue = new Queue('pattern', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    // Remove finished jobs immediately so the singleton id is always free to re-queue.
    removeOnComplete: true,
    removeOnFail: 50,
  },
})

// Schedule a pattern-analysis pass. `delayMs` debounces it: any prior pending
// singleton is removed and rescheduled, so calling this repeatedly during an
// ingest burst results in a single run shortly after the burst settles.
export async function addPatternJob(delayMs = 0): Promise<void> {
  // Clear any existing singleton (queued / delayed / finished) so a fresh
  // analysis is guaranteed to run on the latest data.
  const existing = await patternQueue.getJob('pattern-singleton')
  if (existing) await existing.remove().catch(() => undefined)

  await patternQueue.add('analyze-patterns', {}, { jobId: 'pattern-singleton', delay: delayMs })
}
