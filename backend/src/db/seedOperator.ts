import bcrypt from 'bcryptjs'
import { query } from './postgres'
import { logger } from '../utils/logger'

// Default demo credentials — change in production
const DEFAULT_OPERATOR = {
  name: 'Ankit Sharma',
  email: 'admin@drishti.com',
  password: 'drishti@123',
  role: 'admin' as const,
}

export async function seedOperator(): Promise<void> {
  const existing = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM operators'
  )

  if (parseInt(existing[0].count, 10) > 0) {
    logger.info('Operator already seeded. Skipping.')
    return
  }

  const password_hash = await bcrypt.hash(DEFAULT_OPERATOR.password, 10)

  await query(
    `INSERT INTO operators (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`,
    [DEFAULT_OPERATOR.name, DEFAULT_OPERATOR.email, password_hash, DEFAULT_OPERATOR.role]
  )

  // Never log the password — Docker/CloudWatch logs persist. It lives on the
  // login page (pre-filled demo credentials) and in the README.
  logger.info(`Default operator seeded — email: ${DEFAULT_OPERATOR.email}`)
}
