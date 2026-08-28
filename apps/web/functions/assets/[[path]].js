export async function onRequest(context) {
  const response = await context.next()
  const contentType = (response.headers.get('content-type') || '').toLowerCase()

  if (contentType.includes('text/html')) {
    return new Response(context.request.method === 'HEAD' ? null : 'Not found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
      },
    })
  }

  return response
}
