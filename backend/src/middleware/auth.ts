import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  id: string
  email: string
  role: 'operator' | 'admin'
}

// Extend Express Request so every route has req.operator typed
declare global {
  namespace Express {
    interface Request {
      operator?: JwtPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-secret') as JwtPayload
    req.operator = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token expired or invalid' })
  }
}
