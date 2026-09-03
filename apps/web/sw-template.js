const CACHE_PREFIX = 'money-dance-'
const CACHE_NAME = 'money-dance-__MONEY_DANCE_CACHE_VERSION__'
const PRECACHE_URLS = __MONEY_DANCE_PRECACHE_URLS__
const PRECACHE_PATHS = new Set(PRECACHE_URLS)
const OFFLINE_DOCUMENT = '/index.html'

function expectedContentType(pathname) {
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) return 'javascript'
  if (pathname.endsWith('.css')) return 'text/css'
  if (pathname.endsWith('.html') || pathname === '/') return 'text/html'
  if (pathname.endsWith('.webmanifest')) return 'application/manifest+json'
  return null
}

function isValidResponse(request, response) {
  if (!response || !response.ok) return false
  const expected = expectedContentType(new URL(request.url, self.location.origin).pathname)
  if (!expected) return true
  return (response.headers.get('content-type') || '').toLowerCase().includes(expected)
}

async function precacheCurrentBuild() {
  const cache = await caches.open(CACHE_NAME)
  await Promise.all(PRECACHE_URLS.map(async path => {
    const request = new Request(path, { cache: 'reload' })
    const response = await fetch(request)
    if (!isValidResponse(request, response)) throw new Error(`Invalid precache response: ${path}`)
    await cache.put(request, response)
  }))
}

self.addEventListener('install', event => {
  event.waitUntil(precacheCurrentBuild().then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (!isValidResponse(new Request(OFFLINE_DOCUMENT), response)) throw new Error('Invalid document response')
    await cache.put(OFFLINE_DOCUMENT, response.clone())
    return response
  } catch {
    return (await cache.match(OFFLINE_DOCUMENT)) || new Response('当前无法加载 Money Dance，请联网后重试。', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirstBuildAsset(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached && isValidResponse(request, cached)) return cached

  const response = await fetch(request)
  if (!isValidResponse(request, response)) {
    return new Response('Static asset unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstBuildAsset(request))
  }
})
