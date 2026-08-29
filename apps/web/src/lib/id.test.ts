import { describe, expect, it } from 'vitest'
import { createId } from './id'

describe('createId', () => {
  it('uses randomUUID when the browser provides it', () => {
    const expected = '37d27829-fc20-4a88-a88f-046fef2e969f'
    const cryptoApi = { randomUUID: () => expected, getRandomValues: <T extends ArrayBufferView>(value: T) => value }
    expect(createId(cryptoApi as Crypto)).toBe(expected)
  })

  it('creates a UUID when Safari does not provide randomUUID', () => {
    const cryptoApi = { getRandomValues: <T extends ArrayBufferView>(value: T) => {
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength).fill(1)
      return value
    } }
    expect(createId(cryptoApi as Crypto)).toMatch(/^01010101-0101-4101-8101-010101010101$/)
  })

  it('still creates an id when the crypto API is unavailable', () => {
    expect(createId(null)).toMatch(/^money-dance-/)
  })
})
