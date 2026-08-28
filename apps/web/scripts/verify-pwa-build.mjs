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

console.log(`PWA build verified with ${assetUrls.length} entry assets.`)
