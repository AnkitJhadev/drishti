import api from './api'
import { useActionQueueStore } from '../stores/actionQueueStore'

interface ActionInput {
  url: string
  body?: unknown
  label: string
}

// Axios only sets `response` when the server actually replied. No response =
// a network/connectivity failure (offline), which is what we queue for.
function isNetworkError(err: unknown): boolean {
  return !(err as { response?: unknown })?.response
}

const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`

/**
 * Send a mutation now, or queue it if we're offline / the request fails to reach
 * the server. Returns whether it was queued so the caller can update its UI.
 * Genuine server errors (4xx/5xx with a response) are re-thrown, not queued.
 */
export async function sendOrQueue(action: ActionInput): Promise<{ queued: boolean }> {
  const { enqueue } = useActionQueueStore.getState()

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue({ id: newId(), ts: Date.now(), ...action })
    return { queued: true }
  }

  try {
    await api.patch(action.url, action.body)
    return { queued: false }
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue({ id: newId(), ts: Date.now(), ...action })
      return { queued: true }
    }
    throw err // real server rejection — surface it
  }
}

let flushing = false

/** Replay queued actions in order. Stops on the first network failure (retried
 *  on the next reconnect); drops actions the server definitively rejects. */
export async function flushQueue(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    // Re-read the queue each iteration so removals are reflected.
    for (;;) {
      const { queue, remove } = useActionQueueStore.getState()
      const next = queue[0]
      if (!next) break
      try {
        await api.patch(next.url, next.body)
        remove(next.id)
      } catch (err) {
        if (isNetworkError(err)) break // still offline — try again later
        remove(next.id) // poison action (e.g. already resolved) — drop it
      }
    }
  } finally {
    flushing = false
  }
}

/** Register reconnect triggers and flush anything left from a previous session. */
export function initActionQueue(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void flushQueue())
  }
  if (typeof navigator === 'undefined' || navigator.onLine) void flushQueue()
}
