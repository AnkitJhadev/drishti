import { z } from 'zod'

export const chatSchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(2000, 'message too long'),
})

export type ChatBody = z.infer<typeof chatSchema>
