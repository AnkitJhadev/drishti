import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'

// A mutation the operator performed while offline, persisted to IndexedDB so it
// survives a refresh / app close and is replayed on reconnect.
export interface QueuedAction {
  id: string
  url: string
  body?: unknown
  label: string
  ts: number
}

interface ActionQueueState {
  queue: QueuedAction[]
  enqueue: (a: QueuedAction) => void
  remove: (id: string) => void
  clear: () => void
}

export const useActionQueueStore = create<ActionQueueState>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (a) => set((s) => ({ queue: [...s.queue, a] })),
      remove: (id) => set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
      clear: () => set({ queue: [] }),
    }),
    {
      name: 'drishti-action-queue',
      storage: createJSONStorage(() => idbStorage),
    }
  )
)
