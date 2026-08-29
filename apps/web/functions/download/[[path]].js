const APK_NAME = /^money-dance-v\d+\.\d+\.\d+\.apk$/

function json(data, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  })
}

function resolveDownload(pathname) {
  if (pathname === '/download/latest.json') {
    return { key: 'latest.json', cacheControl: 'no-store', downloadFileName: null }
  }

  if (pathname.startsWith('/download/releases/')) {
    const fileName = decodeURIComponent(pathname.slice('/download/releases/'.length))
    if (!APK_NAME.test(fileName)) return null
    return {
      key: `releases/${fileName}`,
      cacheControl: 'public, max-age=31536000, immutable',
      downloadFileName: fileName,
    }
  }

  return null
}

async function handleRequest(context, headOnly) {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  if (pathname === '/download/health') {
    if (headOnly) {
      return new Response(null, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
    return json({ ok: true, source: 'cloudflare-pages-r2' }, 200, 'no-store')
  }

  const download = resolveDownload(pathname)
  if (!download) return new Response(headOnly ? null : 'Not found', { status: 404 })

  const rangeHeader = headOnly ? null : context.request.headers.get('range')
  const object = headOnly
    ? await context.env.RELEASES.head(download.key)
    : await context.env.RELEASES.get(download.key, rangeHeader ? { range: context.request.headers } : undefined)
  if (!object) return new Response(headOnly ? null : 'Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', download.cacheControl)
  headers.set('x-content-type-options', 'nosniff')

  if (download.downloadFileName) {
    headers.set('content-type', 'application/vnd.android.package-archive')
    headers.set('content-disposition', `attachment; filename="${download.downloadFileName}"`)
  }

  let status = 200
  if (!headOnly && rangeHeader && object.range) {
    const offset = object.range.offset ?? 0
    const length = object.range.length ?? object.size
    const end = offset + length - 1
    headers.set('content-range', `bytes ${offset}-${end}/${object.size}`)
    headers.set('content-length', String(length))
    status = 206
  } else {
    headers.set('content-length', String(object.size))
  }

  return new Response(headOnly ? null : object.body, { status, headers })
}

export function onRequestGet(context) {
  return handleRequest(context, false)
}

export function onRequestHead(context) {
  return handleRequest(context, true)
}
