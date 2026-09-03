import { createHash, type Hash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function updateHash(hash: Hash, label: string, content: string | Uint8Array): void {
  hash.update(label)
  hash.update('\0')
  hash.update(content)
  hash.update('\0')
}

function serviceWorkerPlugin(): Plugin {
  return {
    name: 'money-dance-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8')
      const emittedUrls = Object.keys(bundle)
        .filter(fileName => fileName !== 'sw.js' && !fileName.endsWith('.map'))
        .map(fileName => `/${fileName}`)
      const precacheUrls = [...new Set([
        '/index.html',
        '/manifest.webmanifest',
        '/money-dance-icon.svg',
        ...emittedUrls,
      ])].sort()
      const versionHash = createHash('sha256')
      updateHash(versionHash, 'sw-template.js', template)
      updateHash(
        versionHash,
        'index.html',
        readFileSync(fileURLToPath(new URL('./index.html', import.meta.url))),
      )
      for (const fileName of Object.keys(bundle).sort()) {
        if (fileName === 'sw.js' || fileName.endsWith('.map')) continue
        const output = bundle[fileName]!
        updateHash(versionHash, fileName, output.type === 'chunk' ? output.code : output.source)
      }
      for (const publicFile of ['manifest.webmanifest', 'money-dance-icon.svg']) {
        updateHash(
          versionHash,
          publicFile,
          readFileSync(fileURLToPath(new URL(`./public/${publicFile}`, import.meta.url))),
        )
      }
      const cacheVersion = versionHash.digest('hex').slice(0, 12)
      const source = template
        .replace('__MONEY_DANCE_CACHE_VERSION__', cacheVersion)
        .replace('__MONEY_DANCE_PRECACHE_URLS__', JSON.stringify(precacheUrls))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  server: { port: 5173 },
})
