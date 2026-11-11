import bundled from '../../src/lib/chinaHolidays.data.json'

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'x-content-type-options': 'nosniff',
}

export async function onRequestGet({ env }) {
  try {
    const object = await env.RELEASES.get('data/china-holidays.json')
    // The initial deployment works before the first independent data publish.
    return new Response(object ? object.body : JSON.stringify(bundled), { headers })
  } catch {
    return new Response(JSON.stringify({ error: 'Holiday data unavailable' }), { status: 503, headers })
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers })
}
