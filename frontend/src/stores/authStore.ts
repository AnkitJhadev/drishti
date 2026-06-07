import { create } from 'zustand'

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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  operator: null,
  setAuth: (token, operator) => set({ token, operator }),
  clearAuth: () => set({ token: null, operator: null }),
}))
