type CryptoLike = Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>>

function bytesToUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export function createId(cryptoApi: CryptoLike | null | undefined = globalThis.crypto): string {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues === 'function') return bytesToUuid(cryptoApi.getRandomValues(new Uint8Array(16)))
  return `money-dance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
