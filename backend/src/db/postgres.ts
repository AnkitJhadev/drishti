import { Pool, type PoolClient } from 'pg'
import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'

// Single shared connection pool — reused across the entire app
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,               // max 10 concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  logger.error(`Postgres pool error: ${err.message}`)
})

// ── Query helper ────────────────────────────────────────────────────────────
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client: PoolClient = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

// ── Transaction helper ──────────────────────────────────────────────────────
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Run migrations ──────────────────────────────────────────────────────────
export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...')
  const sqlPath = path.join(__dirname, 'migrations', '001_init.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  await query(sql)
  logger.info('Migrations complete.')
}

export default pool
