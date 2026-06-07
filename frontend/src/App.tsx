import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import ErrorBoundary from './components/ErrorBoundary'

// Route-level code splitting — Login loads without the heavy map/chart libs.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))

function Loading() {
  return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#0a0f1e' }}>
      <span className="text-sm" style={{ color: '#6b7280' }}>Loading…</span>
    </div>
  )
}

export default function App() {
  const token = useAuthStore((s) => s.token)

  // Wait for the persisted auth (IndexedDB) to rehydrate before routing,
  // so a reloaded session isn't bounced to /login.
  const [hydrated, setHydrated] = useState(useAuthStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true))
    if (useAuthStore.persist.hasHydrated()) setHydrated(true)
    return unsub
  }, [])

  if (!hydrated) return <Loading />

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={token ? <Dashboard /> : <Navigate to="/login" replace />}
            />
            <Route path="*" element={<Navigate to={token ? '/dashboard' : '/login'} replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
