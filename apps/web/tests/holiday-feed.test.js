import { describe, expect, it, vi } from 'vitest'
import { onRequestGet, onRequestOptions } from '../functions/holidays/china.json.js'
import bundled from '../src/lib/chinaHolidays.data.json'

describe('official holiday data feed', () => {
  it('serves independent R2 updates with cross-origin access and no caching', async () => {
    const body = JSON.stringify({ ...bundled, version: '2098.1' })
    const get = vi.fn().mockResolvedValue({ body })
    const response = await onRequestGet({ env: { RELEASES: { get } } })
    expect(get).toHaveBeenCalledWith('data/china-holidays.json')
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.text()).toBe(body)
  })

  it('serves the audited baseline before the first data publish', async () => {
    const response = await onRequestGet({ env: { RELEASES: { get: async () => null } } })
    expect(await response.json()).toEqual(bundled)
  })

  it('reports a storage outage instead of claiming the baseline is current', async () => {
    const response = await onRequestGet({ env: { RELEASES: { get: async () => { throw new Error('offline') } } } })
    expect(response.status).toBe(503)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('allows app WebViews to make a CORS preflight', () => {
    const response = onRequestOptions()
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS')
  })
})
