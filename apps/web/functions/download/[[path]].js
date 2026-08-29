const APK_NAME = /^money-dance-v\d+\.\d+\.\d+\.apk$/

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function isBrowserNavigation(request, url, download) {
  if (!download.downloadFileName || url.searchParams.get('raw') === '1') return false
  if (request.headers.has('range')) return false
  return request.headers.get('sec-fetch-dest') === 'document'
    || request.headers.get('sec-fetch-mode') === 'navigate'
}

function downloadPage(url, fileName) {
  const rawUrl = escapeHtml(`${url.pathname}?raw=1`)
  const safeFileName = escapeHtml(fileName)
  const version = escapeHtml(fileName.replace(/^money-dance-|\.apk$/g, ''))

  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1d2a20">
  <title>下载 Money Dance ${version}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f1e8;color:#18211a;font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif}main{width:min(100%,440px);padding:36px 28px;border:1px solid rgba(29,42,32,.12);border-radius:28px;background:#fffdf7;box-shadow:0 18px 60px rgba(29,42,32,.1)}small{color:#70806f;letter-spacing:.16em}h1{margin:12px 0 10px;font-size:36px;line-height:1.15}p{margin:0 0 26px;color:#697168;line-height:1.7}.button{display:flex;align-items:center;justify-content:center;min-height:56px;padding:0 20px;border-radius:16px;background:#1d2a20;color:#fffdf7;font-weight:700;text-decoration:none}.hint{margin:14px 0 0;font-size:13px;text-align:center}
  </style>
</head>
<body>
  <main>
    <small>MONEY DANCE · ANDROID</small>
    <h1>安装包已准备好</h1>
    <p>${safeFileName}</p>
    <a id="download" class="button" href="${rawUrl}" download="${safeFileName}">下载安装包</a>
    <p class="hint">如果没有自动开始，请点击上方按钮</p>
  </main>
  <script>setTimeout(()=>document.querySelector('#download').click(),300)</script>
</body>
</html>`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'vary': 'Sec-Fetch-Dest, Sec-Fetch-Mode',
    },
  })
}

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

  if (!headOnly && isBrowserNavigation(context.request, url, download)) {
    return downloadPage(url, download.downloadFileName)
  }

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
  headers.set('vary', 'Sec-Fetch-Dest, Sec-Fetch-Mode')

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
