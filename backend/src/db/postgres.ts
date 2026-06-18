import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'

// NOTE: application queries use Prisma (see db/prisma.ts). This pg pool exists
// ONLY to run the idempotent schema-creation migration on boot — a multi-
// statement SQL file that Prisma's single-statement raw API can't execute in
// one call — and to close cleanly on shutdown.

// Managed Postgres (Supabase, Render, Neon, …) requires TLS; local Docker doesn't.
const dbUrl = process.env.DATABASE_URL ?? ''
const isLocalDb = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  // Enable SSL for hosted databases (managed providers use their own CA chain).
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
})

pool.on('error', (err) => {
  logger.error(`Postgres pool error: ${err.message}`)
})

// ── Run migrations ──────────────────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...')
  // Resolve SQL in both dev (ts-node → src) and prod (compiled → dist, where
  // tsc does not copy .sql files, so fall back to the src tree).
  const candidates = [
    path.join(__dirname, 'migrations', '001_init.sql'),
    path.join(process.cwd(), 'src', 'db', 'migrations', '001_init.sql'),
    path.join(__dirname, '..', '..', 'src', 'db', 'migrations', '001_init.sql'),
  ]
  const sqlPath = candidates.find((p) => fs.existsSync(p))
  if (!sqlPath) {
    throw new Error(`Migration SQL not found. Looked in: ${candidates.join(', ')}`)
  }
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  await pool.query(sql)
  logger.info('Migrations complete.')
}

export default pool
