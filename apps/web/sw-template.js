const CACHE_PREFIX = 'money-dance-'
const CACHE_NAME = 'money-dance-__MONEY_DANCE_CACHE_VERSION__'
const PRECACHE_URLS = __MONEY_DANCE_PRECACHE_URLS__
const PRECACHE_PATHS = new Set(PRECACHE_URLS)
const OFFLINE_DOCUMENT = '/index.html'
const NETWORK_TIMEOUT_MS = 8000

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
  try {
    const cache = await caches.open(CACHE_NAME)
    await Promise.all(PRECACHE_URLS.map(async path => {
      const request = new Request(path, { cache: 'reload' })
      const response = await fetch(request)
      if (!isValidResponse(request, response)) throw new Error(`Invalid precache response: ${path}`)
      await cache.put(request, response)
    }))
  } catch (error) {
    // A failed install must not leave a partial cache that a later retry can
    // mistake for a complete application shell.
    await caches.delete(CACHE_NAME)
    throw error
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precacheCurrentBuild())
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
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

async function fetchWithTimeout(request) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function unavailableDocument() {
  return new Response(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f5f2ea"><title>Money Dance</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f5f2ea;color:#1d241c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><main style="max-width:420px;padding:26px;border:1px solid #dedbd1;border-radius:22px;background:#fcfaf5"><h1 style="margin:0 0 10px;font-size:20px">Money Dance 暂时无法启动</h1><p style="margin:0 0 20px;color:#73796f;font-size:13px;line-height:1.7">应用缓存不可用，网络也没有在限定时间内响应。请确认网络后重试，你的本地数据不会因此被删除。</p><button onclick="location.reload()" style="width:100%;height:46px;border:0;border-radius:12px;background:#1e281f;color:#f8f6eb;font-weight:600">重新打开</button></main></body></html>`, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

async function cacheFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(OFFLINE_DOCUMENT)
  if (cached && isValidResponse(new Request(OFFLINE_DOCUMENT), cached)) return cached

  try {
    const response = await fetchWithTimeout(request)
    if (!isValidResponse(new Request(OFFLINE_DOCUMENT), response)) throw new Error('Invalid document response')
    return response
  } catch {
    return unavailableDocument()
  }
}

async function cacheFirstBuildAsset(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached && isValidResponse(request, cached)) return cached

  let response
  try {
    response = await fetchWithTimeout(request)
  } catch {
    return new Response('Static asset unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
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
    event.respondWith(cacheFirstNavigation(request))
    return
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstBuildAsset(request))
  }
})
