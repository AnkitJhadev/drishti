import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().email('must be a valid email'),
  password: z.string().min(1, 'password is required'),
})

export type LoginBody = z.infer<typeof loginSchema>
