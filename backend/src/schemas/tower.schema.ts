import { z } from 'zod'

export const createTowerSchema = z.object({
  name: z.string().trim().min(1, 'tower name is required').max(120),
  lat: z.number().min(-90, 'latitude must be between -90 and 90').max(90, 'latitude must be between -90 and 90'),
  lng: z.number().min(-180, 'longitude must be between -180 and 180').max(180, 'longitude must be between -180 and 180'),
  coverage_radius_km: z.number().positive().max(50).optional(),
})

export type CreateTowerBody = z.infer<typeof createTowerSchema>
