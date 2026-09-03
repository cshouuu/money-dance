import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const distUrl = new URL('../dist/', import.meta.url)
const indexHtml = await readFile(new URL('index.html', distUrl), 'utf8')
const serviceWorker = await readFile(new URL('sw.js', distUrl), 'utf8')
const headers = await readFile(new URL('_headers', distUrl), 'utf8')
const assetUrls = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])

assert(assetUrls.length >= 2, 'index.html should reference the built JavaScript and CSS assets')
assert(!serviceWorker.includes('__MONEY_DANCE_'), 'service worker build placeholders must be replaced')
assert.match(serviceWorker, /money-dance-[a-f0-9]{12}/, 'service worker cache must be versioned per build')
assert(serviceWorker.includes("request.mode === 'navigate'"), 'only navigation requests may use the document fallback')
assert(!serviceWorker.includes("cached || caches.match('/')"), 'asset failures must never fall back to index.html')
assert(serviceWorker.includes('alwaysReturnResponse'), 'fetch handlers must convert internal failures into responses')
assert(!serviceWorker.includes('skipWaiting'), 'updates must not take over clients during an active session')
assert(indexHtml.includes('id="boot-recovery"'), 'the static shell must include cache recovery UI')
assert(!indexHtml.includes('localStorage.clear'), 'cache recovery must never clear user data')
assert.match(headers, /\/sw\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/, 'sw.js must bypass HTTP caches')

for (const assetUrl of assetUrls) {
  await access(new URL(assetUrl.slice(1), distUrl))
  assert(serviceWorker.includes(JSON.stringify(assetUrl)), `${assetUrl} must be precached`)
  if (assetUrl.endsWith('.css')) {
    const stylesheet = await readFile(new URL(assetUrl.slice(1), distUrl), 'utf8')
    assert(!stylesheet.includes('fonts.googleapis.com'), 'startup must not depend on Google Fonts')
  }
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

const browserDownload = await onRequestGet({
  request: new Request(downloadUrl, {
    headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
  }),
  env: { RELEASES: releases },
})
assert.equal(browserDownload.status, 200, 'browser navigation must return a download page')
assert.match(browserDownload.headers.get('content-type') || '', /^text\/html/, 'browser download page must return HTML')
const browserDownloadHtml = await browserDownload.text()
assert.match(browserDownloadHtml, /\?raw=1/, 'browser download page must link to the raw APK')
assert.match(browserDownloadHtml, /download="money-dance-v0\.2\.20\.apk"/, 'browser download page must use the download attribute')
assert.equal(calls.length, 0, 'browser download page must not stream the APK before the user starts the download')

const rawBrowserDownload = await onRequestGet({
  request: new Request(`${downloadUrl}?raw=1`, {
    headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' },
  }),
  env: { RELEASES: releases },
})
assert.equal(rawBrowserDownload.status, 200, 'raw browser downloads must return the APK')
assert.equal(rawBrowserDownload.headers.get('content-type'), 'application/vnd.android.package-archive')

const fullDownload = await onRequestGet({ request: new Request(downloadUrl), env: { RELEASES: releases } })
assert.equal(fullDownload.status, 200, 'normal APK downloads must return 200')
assert.equal(fullDownload.headers.get('content-range'), null, 'normal downloads must not include Content-Range')
assert.equal(calls[1].options, undefined, 'normal downloads must not send an empty range option to R2')

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
