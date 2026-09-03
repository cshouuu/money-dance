import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const baseUrl = new URL(process.argv[2] || 'https://money-dance-6gl.pages.dev/')
const distUrl = new URL('../dist/', import.meta.url)
const expectedIndex = await readFile(new URL('index.html', distUrl), 'utf8')
const expectedWorker = await readFile(new URL('sw.js', distUrl), 'utf8')
const expectedCache = expectedWorker.match(/money-dance-[a-f0-9]{12}/)?.[0]
const expectedAssets = [...expectedIndex.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]).sort()

assert(expectedCache, 'local service worker cache version is missing')
assert(expectedAssets.length >= 2, 'local build entry assets are missing')

async function fetchText(path, expectedContentType) {
  const response = await fetch(new URL(path, baseUrl), {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  assert(response.ok, `${path} returned ${response.status}`)
  assert((response.headers.get('content-type') || '').toLowerCase().includes(expectedContentType), `${path} returned the wrong content type`)
  return { response, text: await response.text() }
}

let lastError
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    const { text: indexHtml } = await fetchText('/', 'text/html')
    const { response: workerResponse, text: worker } = await fetchText('/sw.js', 'javascript')
    await fetchText('/manifest.webmanifest', 'application/manifest+json')
    const remoteAssets = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]).sort()
    assert.deepEqual(remoteAssets, expectedAssets, 'deployed HTML does not reference this build')
    assert(worker.includes(expectedCache), 'deployed service worker does not match this build')
    assert((workerResponse.headers.get('cache-control') || '').includes('no-store'), 'deployed service worker may be cached')
    for (const asset of expectedAssets) {
      assert(worker.includes(JSON.stringify(asset)), `${asset} is missing from the deployed precache`)
      await fetchText(asset, asset.endsWith('.css') ? 'text/css' : 'javascript')
    }
    console.log(`Live PWA verified: ${expectedCache}, ${expectedAssets.length} entry assets.`)
    process.exit(0)
  } catch (error) {
    lastError = error
    console.log(`Waiting for PWA deployment propagation (${attempt}/8): ${error.message}`)
    if (attempt < 8) await new Promise(resolve => setTimeout(resolve, 5_000))
  }
}

throw lastError
