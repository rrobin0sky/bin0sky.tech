/**
 * bin0sky Edge Gateway Worker
 * Single-domain unified routing:
 *   bin0sky.tech/icon/*    -> icon.bin0sky.tech
 *   bin0sky.tech/ppt/*     -> ppt.bin0sky.tech
 *   bin0sky.tech/console/* -> console.bin0sky.tech
 *   bin0sky.tech/ambient/* -> ambient.bin0sky.tech
 *   Everything else        -> bin0sky.tech (Main Portal & /notes/*)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // Sub-apps route mapping
    const routes = [
      { prefix: '/icon', target: 'https://icon.bin0sky.tech' },
      { prefix: '/ppt', target: 'https://ppt.bin0sky.tech' },
      { prefix: '/console', target: 'https://console.bin0sky.tech' },
      { prefix: '/ambient', target: 'https://ambient.bin0sky.tech' },
    ];

    for (const route of routes) {
      if (pathname === route.prefix || pathname.startsWith(route.prefix + '/')) {
        // Strip the prefix to request the root of the sub-app
        const subPath = pathname.slice(route.prefix.length) || '/';
        const targetUrl = `${route.target}${subPath}${search}`;
        
        const newHeaders = new Headers(request.headers);
        newHeaders.set('X-Forwarded-Host', url.host);

        const newRequest = new Request(targetUrl, {
          method: request.method,
          headers: newHeaders,
          body: request.body,
          redirect: 'follow',
        });
        
        return fetch(newRequest);
      }
    }

    // Default: pass through to main site
    return fetch(request);
  },
};
