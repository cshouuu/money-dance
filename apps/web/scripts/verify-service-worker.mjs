import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const template = await readFile(new URL('../sw-template.js', import.meta.url), 'utf8')
const workerSource = template
  .replace('__MONEY_DANCE_CACHE_VERSION__', 'abcdef012345')
  .replace('__MONEY_DANCE_PRECACHE_URLS__', JSON.stringify([
    '/index.html',
    '/manifest.webmanifest',
    '/assets/app.js',
    '/assets/app.css',
  ]))

function response(body, contentType, status = 200) {
  return new Response(body, { status, headers: { 'content-type': contentType } })
}

function createHarness(overrides = {}) {
  const listeners = new Map()
  const cache = {
    match: overrides.match || (async () => null),
    put: overrides.put || (async () => undefined),
  }
  const cacheStorage = {
    open: overrides.open || (async () => cache),
    keys: overrides.keys || (async () => ['money-dance-previous']),
    delete: overrides.delete || (async () => true),
  }
  const serviceWorker = {
    location: { origin: 'https://app.test' },
    clients: { claim: overrides.claim || (async () => undefined) },
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
  }
  const fetch = overrides.fetch || (async request => {
    const pathname = new URL(request.url).pathname
    if (pathname.endsWith('.js')) return response('export {}', 'application/javascript')
    if (pathname.endsWith('.css')) return response('body{}', 'text/css')
    if (pathname.endsWith('.webmanifest')) return response('{}', 'application/manifest+json')
    return response('<!doctype html><title>Money Dance</title>', 'text/html')
  })

  vm.runInNewContext(workerSource, {
    AbortController,
    Request,
    Response,
    URL,
    caches: cacheStorage,
    clearTimeout,
    console,
    fetch,
    self: serviceWorker,
    setTimeout,
  })

  return {
    async dispatchFetch(request) {
      let responsePromise
      listeners.get('fetch')?.({
        request,
        respondWith(value) {
          responsePromise = Promise.resolve(value)
        },
      })
      assert(responsePromise, `worker did not handle ${request.url}`)
      return responsePromise
    },
    async dispatchLifecycle(type) {
      let lifetimePromise
      listeners.get(type)?.({
        waitUntil(value) {
          lifetimePromise = Promise.resolve(value)
        },
      })
      assert(lifetimePromise, `worker did not register ${type}`)
      return lifetimePromise
    },
  }
}

function navigationRequest(path = '/') {
  return { method: 'GET', mode: 'navigate', url: `https://app.test${path}` }
}

function assetRequest(path = '/assets/app.js') {
  return { method: 'GET', mode: 'cors', url: `https://app.test${path}` }
}

{
  const harness = createHarness({
    open: async () => { throw new Error('cache unavailable') },
    fetch: async () => response('<!doctype html>network', 'text/html'),
  })
  const result = await harness.dispatchFetch(navigationRequest())
  assert.equal(result.status, 200)
  assert.match(await result.text(), /network/)
}

{
  const harness = createHarness({
    fetch: async () => { throw new Error('offline') },
    match: async () => response('<!doctype html>cached', 'text/html'),
  })
  const result = await harness.dispatchFetch(navigationRequest('/ledger'))
  assert.equal(result.status, 200)
  assert.match(await result.text(), /cached/)
}

{
  const harness = createHarness({
    open: async () => { throw new Error('cache unavailable') },
    fetch: async () => { throw new Error('offline') },
  })
  const result = await harness.dispatchFetch(navigationRequest())
  assert.equal(result.status, 503)
  assert.match(result.headers.get('content-type') || '', /text\/html/)
  assert.match(await result.text(), /本地数据不会因此被删除/)
}

{
  const harness = createHarness({
    fetch: async () => { throw new Error('offline') },
    match: async () => { throw new Error('cache read failed') },
  })
  const result = await harness.dispatchFetch(navigationRequest())
  assert.equal(result.status, 503)
}

{
  const harness = createHarness({
    fetch: async () => response('<!doctype html>network', 'text/html'),
    put: async () => { throw new Error('cache write failed') },
  })
  const result = await harness.dispatchFetch(navigationRequest())
  assert.equal(result.status, 200)
  assert.match(await result.text(), /network/)
}

{
  const harness = createHarness({
    open: async () => { throw new Error('cache unavailable') },
    fetch: async () => response('export const ready = true', 'application/javascript'),
  })
  const result = await harness.dispatchFetch(assetRequest())
  assert.equal(result.status, 200)
  assert.match(await result.text(), /ready/)
}

{
  const harness = createHarness({
    match: async () => { throw new Error('cache read failed') },
    fetch: async () => { throw new Error('offline') },
  })
  const result = await harness.dispatchFetch(assetRequest())
  assert.equal(result.status, 503)
  assert.match(result.headers.get('content-type') || '', /text\/plain/)
}

{
  const deleted = []
  const harness = createHarness({
    delete: async key => {
      deleted.push(key)
      return true
    },
    fetch: async request => {
      if (new URL(request.url).pathname === '/assets/app.js') throw new Error('partial deploy')
      const pathname = new URL(request.url).pathname
      if (pathname.endsWith('.css')) return response('body{}', 'text/css')
      if (pathname.endsWith('.webmanifest')) return response('{}', 'application/manifest+json')
      return response('<!doctype html>', 'text/html')
    },
  })
  await assert.rejects(harness.dispatchLifecycle('install'), /partial deploy/)
  assert.deepEqual(deleted, ['money-dance-abcdef012345'])
}

{
  const harness = createHarness({
    keys: async () => { throw new Error('cache index unavailable') },
    claim: async () => { throw new Error('claim unavailable') },
  })
  await assert.doesNotReject(harness.dispatchLifecycle('activate'))
}

console.log('Service worker failure paths verified.')
