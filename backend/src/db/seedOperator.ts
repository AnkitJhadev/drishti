import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { logger } from '../utils/logger'

// Default demo credentials — change in production
const DEFAULT_OPERATOR = {
  name: 'Ankit Sharma',
  email: 'admin@drishti.com',
  password: 'drishti@123',
  role: 'admin' as const,
}

export async function seedOperator(): Promise<void> {
  const count = await prisma.operators.count()
  if (count > 0) {
    logger.info('Operator already seeded. Skipping.')
    return
  }

  const password_hash = await bcrypt.hash(DEFAULT_OPERATOR.password, 10)

  // upsert by unique email = INSERT … ON CONFLICT DO NOTHING
  await prisma.operators.upsert({
    where: { email: DEFAULT_OPERATOR.email },
    update: {},
    create: {
      name: DEFAULT_OPERATOR.name,
      email: DEFAULT_OPERATOR.email,
      password_hash,
      role: DEFAULT_OPERATOR.role,
    },
  })

  // Never log the password — Docker/CloudWatch logs persist. It lives on the
  // login page (pre-filled demo credentials) and in the README.
  logger.info(`Default operator seeded — email: ${DEFAULT_OPERATOR.email}`)
}
