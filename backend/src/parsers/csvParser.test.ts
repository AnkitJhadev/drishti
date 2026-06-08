import { describe, it, expect } from 'vitest'
import { parseCsv, CsvFormatError } from './csvParser'

const buf = (s: string) => Buffer.from(s, 'utf-8')

describe('parseCsv (strict structured format)', () => {
  it('parses valid rows with known locations', () => {
    const { rows, rejected } = parseCsv(
      buf('complaint,location,phone\n"No signal at all",Bandra Mumbai,9820011001\n')
    )
    expect(rejected).toHaveLength(0)
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('No signal at all')
    expect(rows[0].location).toBe('Bandra Mumbai')
    expect(rows[0].sender).toBe('9820011001')
  })

  it('throws CsvFormatError when required headers are missing', () => {
    expect(() => parseCsv(buf('foo,bar\nhello,world\n'))).toThrow(CsvFormatError)
  })

  it('rejects a row with an unknown location but keeps valid rows', () => {
    const { rows, rejected } = parseCsv(
      buf(
        'complaint,location,phone\n' +
          '"No signal here",Goa,99999\n' +
          '"Calls dropping",Bandra Mumbai,88888\n'
      )
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].location).toBe('Bandra Mumbai')
    expect(rejected).toHaveLength(1)
    expect(rejected[0].row).toBe(1)
    expect(rejected[0].reason).toMatch(/unknown location/i)
  })

  it('rejects a row with empty complaint text', () => {
    const { rows, rejected } = parseCsv(buf('complaint,location\n"",Jaipur\n'))
    expect(rows).toHaveLength(0)
    expect(rejected[0].reason).toMatch(/empty .*complaint/i)
  })

  it('rejects a row with empty location', () => {
    const { rows, rejected } = parseCsv(buf('complaint,location\n"Network down",\n'))
    expect(rows).toHaveLength(0)
    expect(rejected[0].reason).toMatch(/empty .*location/i)
  })

  it('is tolerant of header case and whitespace', () => {
    const { rows } = parseCsv(buf(' Complaint , Location \n"Slow internet",Whitefield Bengaluru\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('Slow internet')
  })

  it('phone is optional', () => {
    const { rows } = parseCsv(buf('complaint,location\n"No coverage",OMR Chennai\n'))
    expect(rows).toHaveLength(1)
    expect(rows[0].sender).toBeUndefined()
  })
})
