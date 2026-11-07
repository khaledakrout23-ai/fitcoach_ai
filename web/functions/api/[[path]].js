// Cloudflare Pages Function : transmet /api/* à l'API Kammel hébergée sur Render.
// Le navigateur ne parle qu'au domaine du site : le cookie de session reste « même site » (SameSite=Strict),
// sans CORS. Variables à définir dans Cloudflare Pages : API_ORIGIN (https://xxx.onrender.com) et PROXY_SECRET.
export async function onRequest({ request, env }) {
  const apiOrigin = String(env.API_ORIGIN || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(apiOrigin) || !env.PROXY_SECRET) {
    return new Response(JSON.stringify({ code: 'PROXY_NOT_CONFIGURED', message: 'API non configurée.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  const url = new URL(request.url);
  const target = apiOrigin + url.pathname + url.search;

  const headers = new Headers(request.headers);
  // valeurs fixées par le proxy (jamais celles envoyées par le client)
  headers.set('x-kammel-proxy', env.PROXY_SECRET);
  headers.set('x-client-ip', request.headers.get('cf-connecting-ip') || '');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', 'https');
  headers.delete('host');

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });
  // en-têtes (dont Set-Cookie) et statut renvoyés tels quels
  return new Response(response.body, response);
}
