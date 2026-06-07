import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// Dev: '/api' is proxied to localhost:4000 by Vite.
// Prod: set VITE_API_URL to the deployed backend origin (e.g. Render URL).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
    }
    return Promise.reject(err)
  }
)

export default api
