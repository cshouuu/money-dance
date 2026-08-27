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

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const pathname = url.pathname

  if (pathname === '/download/health') {
    return json({ ok: true, source: 'cloudflare-pages-r2' }, 200, 'no-store')
  }

  let key
  let cacheControl

  if (pathname === '/download/latest.json') {
    key = 'latest.json'
    cacheControl = 'no-store'
  } else if (pathname.startsWith('/download/releases/')) {
    const fileName = decodeURIComponent(pathname.slice('/download/releases/'.length))
    if (!APK_NAME.test(fileName)) return new Response('Not found', { status: 404 })
    key = `releases/${fileName}`
    cacheControl = 'public, max-age=31536000, immutable'
  } else {
    return new Response('Not found', { status: 404 })
  }

  const object = await context.env.RELEASES.get(key, {
    range: context.request.headers,
  })
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', cacheControl)
  headers.set('x-content-type-options', 'nosniff')

  let status = 200
  if (object.range) {
    const offset = object.range.offset ?? 0
    const length = object.range.length ?? object.size
    const end = offset + length - 1
    headers.set('content-range', `bytes ${offset}-${end}/${object.size}`)
    headers.set('content-length', String(length))
    status = 206
  } else {
    headers.set('content-length', String(object.size))
  }

  return new Response(object.body, { status, headers })
}
