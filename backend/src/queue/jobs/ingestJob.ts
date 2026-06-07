import { Queue } from 'bullmq'
import { redisConnection } from '../worker'

export interface IngestJobData {
  complaintId: string
  rawText: string
  source: string
}

export const ingestQueue = new Queue<IngestJobData>('ingest', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,   // keep last 100 completed jobs
    removeOnFail: 200,
  },
})

export async function addIngestJob(data: IngestJobData): Promise<void> {
  await ingestQueue.add('process-complaint', data, {
    jobId: `ingest-${data.complaintId}`,   // deduplicate by complaint ID
  })
}
