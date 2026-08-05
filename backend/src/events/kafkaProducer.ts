// Best-effort event publisher — an independent audit/replay log alongside the
// primary BullMQ pipeline, not a replacement for it. Entirely optional: with
// KAFKA_BROKERS unset (e.g. the EC2/Vercel deployment), every call below is a
// silent no-op and never affects the main request/job flow.
import { Kafka, logLevel, type Producer } from 'kafkajs'
import { logger } from '../utils/logger'

const brokers = (process.env.KAFKA_BROKERS ?? '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean)

const kafka = brokers.length > 0
  ? new Kafka({ clientId: 'drishti-backend', brokers, logLevel: logLevel.NOTHING })
  : null

let producer: Producer | null = null
let connecting: Promise<Producer> | null = null

async function getProducer(): Promise<Producer> {
  if (producer) return producer
  if (!connecting) {
    connecting = (async () => {
      const p = kafka!.producer()
      await p.connect()
      logger.info(`Kafka producer connected — brokers: ${brokers.join(', ')}`)
      producer = p
      return p
    })()
  }
  return connecting
}

/**
 * Publish a lifecycle event (e.g. "complaint.ingested", "recommendation.approved").
 * Fire-and-forget: failures are logged, never thrown — this must never break
 * the ingest/approval request it's attached to.
 */
export function publishEvent(topic: string, event: Record<string, unknown>): void {
  if (!kafka) return // Kafka not configured — no-op (EC2/Vercel deployment)

  void getProducer()
    .then((p) => p.send({ topic, messages: [{ value: JSON.stringify({ ...event, ts: new Date().toISOString() }) }] }))
    .catch((err) => logger.warn(`Kafka publish skipped (${topic}): ${String(err)}`))
}

export async function disconnectKafka(): Promise<void> {
  if (producer) await producer.disconnect().catch(() => undefined)
}
