import type { Request, Response, NextFunction } from 'express'
import type { ZodType } from 'zod'

// Validate (and coerce) req.body against a zod schema. On failure returns 400
// with the specific field issues; on success replaces req.body with the parsed,
// typed data so handlers can trust their input.
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const details = result.error.issues.map(
        (i) => `${i.path.join('.') || 'body'}: ${i.message}`
      )
      res.status(400).json({ error: 'Validation failed', details })
      return
    }
    req.body = result.data
    next()
  }
}
