import { PrismaClient } from '@prisma/client'

// Single shared Prisma client for the whole app (one connection pool).
// DATABASE_URL is loaded by env.ts before this is used.
export const prisma = new PrismaClient()
