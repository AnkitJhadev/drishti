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
    attempts: 5,
    backoff: { type: 'exponential', delay: 8000 }, // 8s,16s,32s… rides out rate limits
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export async function addIngestJob(data: IngestJobData): Promise<void> {
  await ingestQueue.add('process-complaint', data, {
    jobId: `ingest-${data.complaintId}`,   // deduplicate by complaint ID
  })
}
