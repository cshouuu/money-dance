const APK_PATH = /^releases\/money-dance-v\d+\.\d+\.\d+\.apk$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'money-dance-downloads' }, {
        headers: { 'cache-control': 'no-store' },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    let key;
    if (url.pathname === '/latest.json') {
      key = 'latest.json';
    } else {
      const candidate = url.pathname.replace(/^\//, '');
      if (!APK_PATH.test(candidate)) return new Response('Not Found', { status: 404 });
      key = candidate;
    }

    const object = await env.RELEASES.get(key);
    if (!object) return new Response('Not Found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('x-content-type-options', 'nosniff');

    if (key === 'latest.json') {
      headers.set('content-type', 'application/json; charset=utf-8');
      headers.set('cache-control', 'no-store, max-age=0');
    } else {
      const fileName = key.split('/').pop();
      headers.set('content-type', 'application/vnd.android.package-archive');
      headers.set('content-disposition', `attachment; filename="${fileName}"`);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
    }

    return new Response(request.method === 'HEAD' ? null : object.body, {
      status: 200,
      headers,
    });
  },
};
