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

    // Direct app routes: Redirect to App Shell workstation hash navigation
    // This preserves App Shell (Zones 1-11) and loads the app seamlessly in Zone 12
    const hashRoutes = {
      '/icon': '#/icon',
      '/ppt': '#/ppt',
      '/console': '#/console',
      '/ambient': '#/ambient',
      '/apps': '#/apps',
      '/notes': '#/notes',
      '/labs': '#/labs',
      '/teacher': '#/teacher',
      '/labs/teacher_workspace.html': '#/teacher',
      '/population': '#/population',
      '/fund-cycle': '#/fund-cycle',
      '/fund-breakdown': '#/fund-breakdown',
    };

    const cleanPath = pathname.replace(/\/+$/, '');
    if (hashRoutes[cleanPath]) {
      return Response.redirect(`${url.origin}/${hashRoutes[cleanPath]}`, 302);
    }

    // Sub-apps route mapping for deep assets
    const routes = [
      { prefix: '/icon', target: 'https://icon.bin0sky.tech' },
      { prefix: '/ppt', target: 'https://ppt.bin0sky.tech' },
      { prefix: '/console', target: 'https://console.bin0sky.tech' },
      { prefix: '/ambient', target: 'https://ambient.bin0sky.tech' },
    ];

    for (const route of routes) {
      if (pathname.startsWith(route.prefix + '/')) {
        // Strip the prefix to request the sub-path
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
