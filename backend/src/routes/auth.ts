import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db/prisma'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { loginSchema, type LoginBody } from '../schemas/auth.schema'
import { logger } from '../utils/logger'

const router = Router()

// POST /auth/login
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as LoginBody

    const operator = await prisma.operators.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, password_hash: true, role: true },
    })

    if (!operator) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const valid = await bcrypt.compare(password, operator.password_hash)

    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    // Update last_login
    await prisma.operators.update({ where: { id: operator.id }, data: { last_login: new Date() } })

    const token = jwt.sign(
      { id: operator.id, email: operator.email, role: operator.role },
      process.env.JWT_SECRET ?? 'dev-secret',
      { expiresIn: '8h' }
    )

    logger.info(`Operator ${operator.email} logged in`)

    res.json({
      token,
      operator: {
        id: operator.id,
        name: operator.name,
        email: operator.email,
        role: operator.role,
      },
    })
  } catch (err) {
    logger.error(`Login error: ${String(err)}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /auth/me
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const operator = await prisma.operators.findUnique({
      where: { id: req.operator!.id },
      select: { id: true, name: true, email: true, role: true },
    })

    if (!operator) {
      res.status(404).json({ error: 'Operator not found' })
      return
    }

    res.json({ operator })
  } catch (err) {
    logger.error(`/auth/me error: ${String(err)}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
