/**
 * bin0sky Edge Gateway Worker
 * Single-domain unified routing & Edge APIs:
 *   bin0sky.tech/api/teacher/* -> Teacher Workspace Auth & Cloud Sync (Local-First + Cloudflare KV)
 *   bin0sky.tech/icon/*        -> icon.bin0sky.tech
 *   bin0sky.tech/ppt/*         -> ppt.bin0sky.tech
 *   bin0sky.tech/console/*     -> console.bin0sky.tech
 *   bin0sky.tech/ambient/*     -> ambient.bin0sky.tech
 *   bin0sky.tech/bom/*         -> bom.bin0sky.tech
 *   Everything else            -> bin0sky.tech (Main Portal, /notes/*, /labs/*)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // 0. Edge API: Teacher Workspace Cloud Sync & Lightweight Auth
    if (pathname.startsWith('/api/teacher/')) {
      return handleTeacherApi(request, env);
    }

    // Edge API: NetBOM Cloud Sync (Save & Load by Project Code)
    if (pathname.startsWith('/api/bom/')) {
      return handleBomApi(request, env);
    }

    // Direct app routes: Redirect to App Shell workstation hash navigation
    // This preserves App Shell (Zones 1-11) and loads the app seamlessly in Zone 12
    const hashRoutes = {
      '/icon': '#/icon',
      '/ppt': '#/ppt',
      '/console': '#/console',
      '/ambient': '#/ambient',
      '/bom': '#/bom',
      '/apps': '#/apps',
      '/notes': '#/notes',
      '/labs': '#/labs',
      '/teacher': '#/teacher',
      '/golden-goose': '#/golden-goose',
      '/population': '#/population',
      '/fund-cycle': '#/fund-cycle',
      '/fund-breakdown': '#/fund-breakdown',
    };

    const cleanPath = pathname.replace(/\/+$/, '');
    if (hashRoutes[cleanPath]) {
      return Response.redirect(`${url.origin}/${hashRoutes[cleanPath]}`, 302);
    }

    // Edge Security: Protect Golden Goose Lab (Admin only)
    if (pathname.includes('golden_goose')) {
      const cookieHeader = request.headers.get('Cookie') || '';
      const isAdmin = /(^|;\s*)b0_auth_role=admin(;|$)/.test(cookieHeader);
      if (!isAdmin) {
        return Response.redirect(`${url.origin}/#/golden-goose`, 302);
      }
    }

    // Sub-apps route mapping for deep assets
    const routes = [
      { prefix: '/icon', target: 'https://icon.bin0sky.tech' },
      { prefix: '/ppt', target: 'https://ppt.bin0sky.tech' },
      { prefix: '/console', target: 'https://console.bin0sky.tech' },
      { prefix: '/ambient', target: 'https://ambient.bin0sky.tech' },
      { prefix: '/bom', target: 'https://bom.bin0sky.tech' },
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

/**
 * Teacher Workspace Cloud API Handler
 * Supports:
 * - GET  /api/teacher/status
 * - POST /api/teacher/auth   (Username & Password check / auto-registration)
 * - GET  /api/teacher/sync   (Pull cloud state)
 * - POST /api/teacher/sync   (Push cloud state)
 */
async function handleTeacherApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const hasKV = !!(env && env.TEACHER_KV);

    // 1. Status Check
    if (path === '/api/teacher/status') {
      return new Response(JSON.stringify({
        status: 'ok',
        kvAvailable: hasKV,
        serverTime: Date.now(),
        message: hasKV ? 'Cloudflare KV 边缘同步已就绪' : '本地/单机优先运行中 (如需多端持久云端，可在 CF 绑定 TEACHER_KV)'
      }), { headers: corsHeaders });
    }

    // 2. Auth Endpoint
    if (path === '/api/teacher/auth' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { username, passwordHash } = body;

      if (!username || !passwordHash) {
        return new Response(JSON.stringify({ error: '请提供用户名和密码' }), { status: 400, headers: corsHeaders });
      }

      const cleanUser = String(username).trim().toLowerCase();

      if (hasKV) {
        const userKey = `teacher:user:${cleanUser}`;
        const existing = await env.TEACHER_KV.get(userKey, 'json');

        if (!existing) {
          // Auto-register on first successful setup
          await env.TEACHER_KV.put(userKey, JSON.stringify({
            username: cleanUser,
            passwordHash,
            createdAt: Date.now(),
            lastLoginAt: Date.now()
          }));
        } else {
          if (existing.passwordHash !== passwordHash) {
            return new Response(JSON.stringify({ error: '密码不正确，请重新输入' }), { status: 401, headers: corsHeaders });
          }
          existing.lastLoginAt = Date.now();
          await env.TEACHER_KV.put(userKey, JSON.stringify(existing));
        }
      }

      // Generate Session Token (Valid for 30 days)
      const tokenPayload = {
        u: cleanUser,
        exp: Date.now() + 30 * 24 * 3600 * 1000,
        t: Date.now()
      };
      const token = btoa(JSON.stringify(tokenPayload));

      return new Response(JSON.stringify({
        success: true,
        username: cleanUser,
        token,
        kvAvailable: hasKV,
        message: '登录成功'
      }), { headers: corsHeaders });
    }

    // Auth verification helper
    const authHeader = request.headers.get('Authorization') || '';
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    let currentUser = null;

    if (tokenMatch) {
      try {
        const decoded = JSON.parse(atob(tokenMatch[1]));
        if (decoded && decoded.u && decoded.exp > Date.now()) {
          currentUser = decoded.u;
        }
      } catch (e) {}
    }

    if (!currentUser) {
      return new Response(JSON.stringify({ error: '未授权或登录已过期，请重新登录' }), { status: 401, headers: corsHeaders });
    }

    const dataKey = `teacher:data:${currentUser}`;

    // 3. Pull Data (GET /api/teacher/sync)
    if (path === '/api/teacher/sync' && request.method === 'GET') {
      if (hasKV) {
        const stored = await env.TEACHER_KV.get(dataKey, 'json');
        return new Response(JSON.stringify({
          success: true,
          username: currentUser,
          payload: stored || null,
          serverTime: Date.now()
        }), { headers: corsHeaders });
      } else {
        return new Response(JSON.stringify({
          success: true,
          username: currentUser,
          payload: null,
          serverTime: Date.now(),
          kvAvailable: false
        }), { headers: corsHeaders });
      }
    }

    // 4. Push Data (POST /api/teacher/sync)
    if (path === '/api/teacher/sync' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { data, ui, clientUpdatedAt, version } = body;

      const record = {
        data: data || {},
        ui: ui || {},
        version: version || 1,
        clientUpdatedAt: clientUpdatedAt || Date.now(),
        serverUpdatedAt: Date.now(),
        updatedBy: currentUser
      };

      if (hasKV) {
        await env.TEACHER_KV.put(dataKey, JSON.stringify(record));
      }

      return new Response(JSON.stringify({
        success: true,
        serverTime: Date.now(),
        kvAvailable: hasKV,
        message: '云端同步成功'
      }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server Error: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}

/**
 * NetBOM Cloud Sync Edge API Handler
 * Supports:
 * - GET  /api/bom/sync?code=XXXX[&pass=YYYY] (Pull cloud state by project code)
 * - POST /api/bom/sync                       (Push cloud state with project code & optional password)
 */
async function handleBomApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const hasKV = !!(env && env.TEACHER_KV);

    // 1. Get Global Official Default Catalog
    if (path === '/api/bom/default' && request.method === 'GET') {
      if (!hasKV) {
        return new Response(JSON.stringify({ success: false, error: 'KV服务未就绪' }), { status: 503, headers: corsHeaders });
      }
      const defaultRecord = await env.TEACHER_KV.get('bom:global:default', 'json');
      return new Response(JSON.stringify({
        success: true,
        record: defaultRecord || null,
        serverTime: Date.now(),
      }), { headers: corsHeaders });
    }

    // 2. Publish as Global Official Default (Master Password Protected)
    if (path === '/api/bom/publish-default' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { adminKey, payload } = body;

      if (!adminKey || String(adminKey).trim() !== 'bin0sky.tech') {
        return new Response(JSON.stringify({ error: '管理员口令不正确' }), { status: 401, headers: corsHeaders });
      }

      if (!payload) {
        return new Response(JSON.stringify({ error: '发布数据不能为空' }), { status: 400, headers: corsHeaders });
      }

      if (!hasKV) {
        return new Response(JSON.stringify({ error: '云端存储服务未就绪' }), { status: 503, headers: corsHeaders });
      }

      const existing = await env.TEACHER_KV.get('bom:global:default', 'json');
      const version = (existing && existing.version ? existing.version : 0) + 1;

      const record = {
        payload,
        version,
        updatedAt: Date.now(),
        publishedBy: 'admin',
      };

      await env.TEACHER_KV.put('bom:global:default', JSON.stringify(record));

      return new Response(JSON.stringify({
        success: true,
        version,
        updatedAt: record.updatedAt,
        serverTime: Date.now(),
        message: '已成功发布为全网默认！全球所有访问者将直接看到此版本。',
      }), { headers: corsHeaders });
    }

    if (path === '/api/bom/sync') {
      if (request.method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase();
        const pass = (url.searchParams.get('pass') || '').trim();

        if (!code) {
          return new Response(JSON.stringify({ error: '请提供项目同步码' }), { status: 400, headers: corsHeaders });
        }

        if (!hasKV) {
          return new Response(JSON.stringify({ error: '云端存储服务未就绪' }), { status: 503, headers: corsHeaders });
        }

        const dataKey = `bom:code:${code}`;
        const record = await env.TEACHER_KV.get(dataKey, 'json');

        if (!record) {
          return new Response(JSON.stringify({ error: '未找到该同步码对应的云端报价记录' }), { status: 404, headers: corsHeaders });
        }

        if (record.passHash && record.passHash !== pass) {
          return new Response(JSON.stringify({ error: '访问口令不正确', needPass: true }), { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          code,
          payload: record.payload,
          updatedAt: record.updatedAt,
          serverTime: Date.now(),
        }), { headers: corsHeaders });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { code, pass, payload } = body;

        const cleanCode = String(code || '').trim().toUpperCase();
        if (!cleanCode || cleanCode.length < 3) {
          return new Response(JSON.stringify({ error: '同步码至少需要3位字符' }), { status: 400, headers: corsHeaders });
        }

        if (!payload) {
          return new Response(JSON.stringify({ error: '数据载荷不能为空' }), { status: 400, headers: corsHeaders });
        }

        if (!hasKV) {
          return new Response(JSON.stringify({ error: '云端存储服务未就绪' }), { status: 503, headers: corsHeaders });
        }

        const dataKey = `bom:code:${cleanCode}`;
        const existing = await env.TEACHER_KV.get(dataKey, 'json');
        if (existing && existing.passHash && existing.passHash !== (pass || '')) {
          return new Response(JSON.stringify({ error: '该同步码已被口令保护，请输入正确口令' }), { status: 401, headers: corsHeaders });
        }

        const record = {
          code: cleanCode,
          passHash: pass ? String(pass).trim() : (existing ? existing.passHash : ''),
          payload,
          updatedAt: Date.now(),
        };

        await env.TEACHER_KV.put(dataKey, JSON.stringify(record));

        return new Response(JSON.stringify({
          success: true,
          code: cleanCode,
          updatedAt: record.updatedAt,
          serverTime: Date.now(),
          message: '保存成功',
        }), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server Error: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}
