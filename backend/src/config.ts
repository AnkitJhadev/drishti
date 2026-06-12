// Security-critical config, resolved once at boot. In production a missing
// value is a deploy error — fail fast instead of silently signing tokens with
// a guessable dev fallback or opening CORS to localhost.
const isProd = process.env.NODE_ENV === 'production'

function requireInProd(name: string, devFallback: string): string {
  const value = process.env[name]
  if (value) return value
  if (isProd) {
    throw new Error(`${name} must be set in production (see .env.prod.example)`)
  }
  return devFallback
}

export const JWT_SECRET = requireInProd('JWT_SECRET', 'dev-secret')
export const FRONTEND_URL = requireInProd('FRONTEND_URL', 'http://localhost:3000')
