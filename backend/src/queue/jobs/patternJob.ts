import { Queue } from 'bullmq'
import { redisConnection } from '../worker'

export const patternQueue = new Queue('pattern', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 20,
    removeOnFail: 50,
  },
})

// Called after every 10th complaint ingest
export async function addPatternJob(): Promise<void> {
  // Deduplicate — only one pattern job runs at a time
  await patternQueue.add('analyze-patterns', {}, {
    jobId: 'pattern-singleton',
    // If already queued, don't add another
  })
}
