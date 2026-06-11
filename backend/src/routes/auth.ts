import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../db/postgres'
import { requireAuth } from '../middleware/auth'
import { validateBody } from '../middleware/validate'
import { loginSchema, type LoginBody } from '../schemas/auth.schema'
import { logger } from '../utils/logger'

const router = Router()

interface OperatorRow {
  id: string
  name: string
  email: string
  password_hash: string
  role: 'operator' | 'admin'
}

// POST /auth/login
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as LoginBody

    const rows = await query<OperatorRow>(
      'SELECT id, name, email, password_hash, role FROM operators WHERE email = $1',
      [email.toLowerCase().trim()]
    )

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const operator = rows[0]
    const valid = await bcrypt.compare(password, operator.password_hash)

    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    // Update last_login
    await query('UPDATE operators SET last_login = NOW() WHERE id = $1', [operator.id])

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
    const rows = await query<Omit<OperatorRow, 'password_hash'>>(
      'SELECT id, name, email, role FROM operators WHERE id = $1',
      [req.operator!.id]
    )

    if (rows.length === 0) {
      res.status(404).json({ error: 'Operator not found' })
      return
    }

    res.json({ operator: rows[0] })
  } catch (err) {
    logger.error(`/auth/me error: ${String(err)}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
