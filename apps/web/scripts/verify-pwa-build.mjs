import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const distUrl = new URL('../dist/', import.meta.url)
const indexHtml = await readFile(new URL('index.html', distUrl), 'utf8')
const serviceWorker = await readFile(new URL('sw.js', distUrl), 'utf8')
const assetUrls = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])

assert(assetUrls.length >= 2, 'index.html should reference the built JavaScript and CSS assets')
assert(!serviceWorker.includes('__MONEY_DANCE_'), 'service worker build placeholders must be replaced')
assert.match(serviceWorker, /money-dance-[a-f0-9]{12}/, 'service worker cache must be versioned per build')
assert(serviceWorker.includes("request.mode === 'navigate'"), 'only navigation requests may use the document fallback')
assert(!serviceWorker.includes("cached || caches.match('/')"), 'asset failures must never fall back to index.html')

for (const assetUrl of assetUrls) {
  await access(new URL(assetUrl.slice(1), distUrl))
  assert(serviceWorker.includes(JSON.stringify(assetUrl)), `${assetUrl} must be precached`)
}

const { onRequest } = await import('../functions/assets/[[path]].js')
const htmlFallback = await onRequest({
  request: new Request('https://example.com/assets/missing.js'),
  next: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
})
assert.equal(htmlFallback.status, 404, 'missing assets must not return the SPA HTML fallback')

const javascriptAsset = await onRequest({
  request: new Request('https://example.com/assets/current.js'),
  next: async () => new Response('export {}', { headers: { 'content-type': 'application/javascript' } }),
})
assert.equal(javascriptAsset.status, 200, 'valid static assets must pass through unchanged')

const { onRequestGet, onRequestHead } = await import('../functions/download/[[path]].js')
const calls = []
const releaseObject = range => ({
  body: new Uint8Array([80, 75, 3, 4]),
  size: 4,
  range,
  httpEtag: 'test-etag',
  writeHttpMetadata(headers) {
    headers.set('content-type', 'application/octet-stream')
  },
})
const releases = {
  async get(key, options) {
    calls.push({ method: 'get', key, options })
    return releaseObject(options ? { offset: 0, length: 2 } : undefined)
  },
  async head(key) {
    calls.push({ method: 'head', key })
    return releaseObject(undefined)
  },
}
const downloadUrl = 'https://example.com/download/releases/money-dance-v0.2.20.apk'

const fullDownload = await onRequestGet({ request: new Request(downloadUrl), env: { RELEASES: releases } })
assert.equal(fullDownload.status, 200, 'normal APK downloads must return 200')
assert.equal(fullDownload.headers.get('content-range'), null, 'normal downloads must not include Content-Range')
assert.equal(calls[0].options, undefined, 'normal downloads must not send an empty range option to R2')

const partialDownload = await onRequestGet({
  request: new Request(downloadUrl, { headers: { range: 'bytes=0-1' } }),
  env: { RELEASES: releases },
})
assert.equal(partialDownload.status, 206, 'range downloads must return 206')
assert.equal(partialDownload.headers.get('content-range'), 'bytes 0-1/4')

const downloadHead = await onRequestHead({ request: new Request(downloadUrl, { method: 'HEAD' }), env: { RELEASES: releases } })
assert.equal(downloadHead.status, 200, 'APK HEAD requests must return file metadata')
assert.equal(downloadHead.headers.get('content-type'), 'application/vnd.android.package-archive')
assert.match(downloadHead.headers.get('content-disposition') || '', /attachment/)
assert.equal(calls.at(-1).method, 'head', 'HEAD requests must use R2 metadata without downloading the body')

console.log(`PWA build verified with ${assetUrls.length} entry assets.`)
