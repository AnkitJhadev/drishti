import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { connectSocket } from '../services/socket'
import api from '../services/api'

interface LoginResponse {
  token: string
  operator: {
    id: string
    name: string
    email: string
    role: 'operator' | 'admin'
  }
}

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password })
      setAuth(data.token, data.operator)
      connectSocket(data.token)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Login failed. Check your credentials.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0f1e' }}>

      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl font-bold tracking-widest" style={{ color: '#f59e0b' }}>
              DRISHTI
            </span>
            <span className="text-xs px-2 py-0.5 rounded font-mono"
              style={{ background: '#1a2235', color: '#9ca3af', border: '1px solid #1f2937' }}>
              v1.0
            </span>
          </div>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Telecom AI Operations Platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg p-6" style={{ background: '#111827', border: '1px solid #1f2937' }}>

          {/* Live indicator */}
          <div className="flex items-center gap-2 mb-6 pb-4" style={{ borderBottom: '1px solid #1f2937' }}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ background: '#10b981' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#10b981' }} />
            </span>
            <span className="text-xs" style={{ color: '#9ca3af' }}>
              Systems operational — secure login
            </span>
          </div>

          <h1 className="text-base font-semibold mb-5" style={{ color: '#f9fafb' }}>
            Operator Sign In
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                EMAIL ADDRESS
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@telecom.com"
                required
                autoComplete="email"
                className="w-full px-3 py-2 rounded text-sm outline-none transition-colors"
                style={{
                  background: '#0a0f1e',
                  border: '1px solid #1f2937',
                  color: '#f9fafb',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#f59e0b')}
                onBlur={(e) => (e.target.style.borderColor = '#1f2937')}
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded text-sm outline-none transition-colors"
                style={{
                  background: '#0a0f1e',
                  border: '1px solid #1f2937',
                  color: '#f9fafb',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#f59e0b')}
                onBlur={(e) => (e.target.style.borderColor = '#1f2937')}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded text-xs"
                style={{ background: '#7f1d1d', color: '#f87171', border: '1px solid #ef4444' }}>
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded text-sm font-semibold transition-opacity disabled:opacity-50"
              style={{ background: '#f59e0b', color: '#0a0f1e' }}
            >
              {loading ? 'Authenticating...' : 'Sign In →'}
            </button>

          </form>
        </div>

        {/* Demo credentials hint */}
        <div className="mt-4 px-4 py-3 rounded text-xs text-center"
          style={{ background: '#111827', border: '1px solid #1f2937', color: '#6b7280' }}>
          Demo — <span style={{ color: '#9ca3af' }}>admin@drishti.com</span>
          {' / '}
          <span style={{ color: '#9ca3af' }}>drishti@123</span>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#374151' }}>
          DRISHTI © 2026 · Telecom Intelligence
        </p>

      </div>
    </div>
  )
}
