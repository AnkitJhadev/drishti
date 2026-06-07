import { get, set, del } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

// Zustand persist adapter backed by IndexedDB (offline-first).
// IndexedDB (not localStorage) handles larger datasets and works when
// the app is launched fully offline / air-gapped.
export const idbStorage: StateStorage = {
  getItem: async (name) => (await get(name)) ?? null,
  setItem: async (name, value) => { await set(name, value) },
  removeItem: async (name) => { await del(name) },
}
