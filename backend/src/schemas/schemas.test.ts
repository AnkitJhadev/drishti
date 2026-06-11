import { describe, it, expect } from 'vitest'
import { loginSchema } from './auth.schema'
import { chatSchema } from './ai.schema'
import { createTowerSchema } from './tower.schema'

describe('request schemas (zod)', () => {
  it('login accepts valid + rejects bad email / missing password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'nope' }).success).toBe(false)
  })

  it('chat rejects empty / whitespace-only message', () => {
    expect(chatSchema.safeParse({ message: 'hi' }).success).toBe(true)
    expect(chatSchema.safeParse({ message: '   ' }).success).toBe(false)
    expect(chatSchema.safeParse({}).success).toBe(false)
  })

  it('createTower enforces name + lat/lng ranges', () => {
    expect(createTowerSchema.safeParse({ name: 'Nagpur', lat: 21.1, lng: 79 }).success).toBe(true)
    expect(createTowerSchema.safeParse({ name: 'X', lat: 999, lng: 79 }).success).toBe(false)
    expect(createTowerSchema.safeParse({ lat: 21, lng: 79 }).success).toBe(false)
    expect(createTowerSchema.safeParse({ name: 'X', lat: 21, lng: 79, coverage_radius_km: -1 }).success).toBe(false)
  })
})
