import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { idbStorage } from '../services/idbStorage'

interface Operator {
  id: string
  name: string
  email: string
  role: 'operator' | 'admin'
}

interface AuthState {
  token: string | null
  operator: Operator | null
  setAuth: (token: string, operator: Operator) => void
  clearAuth: () => void
}

// Persisted to IndexedDB so the operator stays signed in across reloads and
// when launched offline. (Trade-off vs in-memory-only: required for the
// offline-first / field-deployment use case.)
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      operator: null,
      setAuth: (token, operator) => set({ token, operator }),
      clearAuth: () => set({ token: null, operator: null }),
    }),
    { name: 'drishti-auth', storage: createJSONStorage(() => idbStorage) }
  )
)
