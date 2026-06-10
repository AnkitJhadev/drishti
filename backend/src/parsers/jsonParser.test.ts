import { describe, it, expect } from 'vitest'
import { parseJson, JsonFormatError } from './jsonParser'

const buf = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf-8')

describe('parseJson (strict structured format)', () => {
  it('parses a valid array of complaints', () => {
    const { rows, rejected } = parseJson(
      buf([{ complaint: 'No signal at all', location: 'Bandra Mumbai', phone: '9820011001' }])
    )
    expect(rejected).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('No signal at all')
    expect(rows[0].location).toBe('Bandra Mumbai')
    expect(rows[0].sender).toBe('9820011001')
  })

  it('accepts a { complaints: [...] } wrapper', () => {
    const { rows } = parseJson(buf({ complaints: [{ complaint: 'Slow internet', location: 'Whitefield Bengaluru' }] }))
    expect(rows).toHaveLength(1)
  })

  it('throws JsonFormatError on invalid JSON', () => {
    expect(() => parseJson(Buffer.from('{not json', 'utf-8'))).toThrow(JsonFormatError)
  })

  it('throws JsonFormatError when it is not an array', () => {
    expect(() => parseJson(buf({ foo: 'bar' }))).toThrow(JsonFormatError)
  })

  it('rejects items with an unknown location but keeps valid ones', () => {
    const { rows, rejected } = parseJson(
      buf([
        { complaint: 'No signal', location: 'Goa' },
        { complaint: 'Calls dropping', location: 'Bandra Mumbai' },
      ])
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].location).toBe('Bandra Mumbai')
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatch(/unknown location/i)
  })

  it('rejects items missing complaint or location', () => {
    const { rows, rejected } = parseJson(
      buf([{ complaint: '', location: 'Jaipur' }, { complaint: 'Network down', location: '' }])
    )
    expect(rows).toHaveLength(0)
    expect(rejected).toHaveLength(2)
  })
})
