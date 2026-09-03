import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
      const cacheVersion = createHash('sha256')
        .update(template)
        .update(precacheUrls.join('\n'))
        .digest('hex')
        .slice(0, 12)
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
