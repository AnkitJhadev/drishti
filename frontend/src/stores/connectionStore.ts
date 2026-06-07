import { create } from 'zustand'

interface ConnectionState {
  connected: boolean
  setConnected: (connected: boolean) => void
}

// Tracks the real Socket.io connection state for the LIVE indicator.
export const useConnectionStore = create<ConnectionState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}))
