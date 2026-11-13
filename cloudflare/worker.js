/**
 * bin0sky Edge Gateway Worker
 * Single-domain unified routing & Edge APIs:
 *   bin0sky.tech/api/auth/*    -> Universal Auth & RBAC (Guest, User, Admin)
 *   bin0sky.tech/api/bom/*     -> NetBOM Cloud Sync & User Project Management
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

    // 0. Edge API: Universal Auth & RBAC
    if (pathname.startsWith('/api/auth/')) {
      return handleAuthApi(request, env);
    }

    // Edge API: NetBOM Cloud Sync & Personal Projects
    if (pathname.startsWith('/api/bom/')) {
      return handleBomApi(request, env);
    }

    // Edge API: Teacher Workspace Cloud Sync & Lightweight Auth
    if (pathname.startsWith('/api/teacher/')) {
      return handleTeacherApi(request, env);
    }

    // Direct app routes: Redirect to App Shell workstation hash navigation
    const hashRoutes = {
      '/icon': '#/icon',
      '/ppt': '#/ppt',
      '/console': '#/console',
      '/ambient': '#/ambient',
      '/bom': '#/bom',
      '/nettest': '#/nettest',
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
      const user = await getAuthUser(request, env);
      const cookieHeader = request.headers.get('Cookie') || '';
      const hasLegacyAdminCookie = /(^|;\s*)b0_auth_role=admin(;|$)/.test(cookieHeader);
      const isAdmin = (user && user.role === 'admin') || hasLegacyAdminCookie;

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
      { prefix: '/nettest', target: 'https://nettest.bin0sky.tech' },
    ];

    for (const route of routes) {
      if (pathname.startsWith(route.prefix + '/')) {
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

    // Next.js static asset fallback (powers ArchIcons when proxied or deep linked)
    if (pathname.startsWith('/_next/')) {
      const targetUrl = `https://icon.bin0sky.tech${pathname}${search}`;
      const newHeaders = new Headers(request.headers);
      newHeaders.set('X-Forwarded-Host', url.host);
      return fetch(new Request(targetUrl, {
        method: request.method,
        headers: newHeaders,
        redirect: 'follow',
      }));
    }

    // Default: pass through to main site
    return fetch(request);
  },
};

// ==========================================
// 🛡️ AUTH & CRYPTO UTILITIES (HMAC-SHA256)
// ==========================================

function getAdminInitKey(env) {
  return (env && env.ADMIN_INIT_KEY) ? String(env.ADMIN_INIT_KEY).trim() : 'bin0sky.tech';
}

function getJwtSecret(env) {
  return (env && env.JWT_SECRET) ? String(env.JWT_SECRET).trim() : 'bin0sky-jwt-secret-2024-unified';
}

// 🛡️ 静默管理员白名单判定 (支持用户名列表与邮箱列表)
function checkIsAdminUser(username, email, env) {
  const cleanU = String(username || '').trim().toLowerCase();
  const cleanE = String(email || '').trim().toLowerCase();

  const adminUsers = ((env && env.ADMIN_USERNAMES) || 'robin,admin,bin0sky')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const adminEmails = ((env && env.ADMIN_EMAILS) || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (cleanU && adminUsers.includes(cleanU)) return true;
  if (cleanE && adminEmails.includes(cleanE)) return true;

  return false;
}

// 🛡️ 登录频控保护 (防暴力破解)
async function checkLoginRateLimit(request, env) {
  if (!env || !env.TEACHER_KV) return true;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const rec = await env.TEACHER_KV.get(`ratelimit:login:${ip}`, 'json');
  if (rec && rec.count >= 5 && Date.now() < rec.lockUntil) {
    return false;
  }
  return true;
}

async function recordLoginFailure(request, env) {
  if (!env || !env.TEACHER_KV) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const rec = (await env.TEACHER_KV.get(`ratelimit:login:${ip}`, 'json')) || { count: 0, lockUntil: 0 };
  const count = rec.count + 1;
  const lockUntil = count >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
  await env.TEACHER_KV.put(`ratelimit:login:${ip}`, JSON.stringify({ count, lockUntil }), { expirationTtl: 600 });
}

async function clearLoginFailure(request, env) {
  if (!env || !env.TEACHER_KV) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  await env.TEACHER_KV.delete(`ratelimit:login:${ip}`);
}

function getAuthCorsHeaders(request) {
  const origin = request.headers.get('Origin') || 'https://bin0sky.tech';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  };
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function signToken(payload, secret) {
  const secretKey = secret || 'bin0sky-jwt-secret-2024-unified';
  const exp = Date.now() + 30 * 24 * 3600 * 1000; // 30 days
  const data = JSON.stringify({ ...payload, exp });
  const base64Data = btoa(unescape(encodeURIComponent(data)));

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(base64Data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${base64Data}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Data, sig] = parts;

  try {
    const secretKey = secret || 'bin0sky-jwt-secret-2024-unified';
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    let rawSigBase64 = sig.replace(/-/g, '+').replace(/_/g, '/');
    while (rawSigBase64.length % 4 !== 0) rawSigBase64 += '=';
    const rawSig = atob(rawSigBase64);
    const sigArr = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) sigArr[i] = rawSig.charCodeAt(i);

    const valid = await crypto.subtle.verify('HMAC', key, sigArr, enc.encode(base64Data));
    if (!valid) return null;

    const json = decodeURIComponent(escape(atob(base64Data)));
    const payload = JSON.parse(json);
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach((c) => {
    const [k, v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v || '');
  });
  return cookies;
}

async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  let token = null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m) {
    token = m[1];
  } else {
    const cookies = parseCookies(request);
    token = cookies['b0_token'];
  }

  if (!token) return null;
  const secret = getJwtSecret(env);
  return verifyToken(token, secret);
}

function appendAuthCookies(headers, token, role, requestUrl) {
  const url = new URL(requestUrl);
  const isProd = url.hostname.includes('bin0sky.tech');
  const domainAttr = isProd ? '; Domain=.bin0sky.tech' : '';
  const secureAttr = isProd ? '; Secure' : '';
  const maxAge = 30 * 24 * 3600;

  headers.append('Set-Cookie', `b0_token=${token}; Path=/${domainAttr}; Max-Age=${maxAge}; SameSite=Lax; HttpOnly${secureAttr}`);
  headers.append('Set-Cookie', `b0_auth_role=${role}; Path=/${domainAttr}; Max-Age=${maxAge}; SameSite=Lax${secureAttr}`);
}

function appendClearCookies(headers, requestUrl) {
  const url = new URL(requestUrl);
  const isProd = url.hostname.includes('bin0sky.tech');
  const domainAttr = isProd ? '; Domain=.bin0sky.tech' : '';

  headers.append('Set-Cookie', `b0_token=; Path=/${domainAttr}; Max-Age=0; SameSite=Lax`);
  headers.append('Set-Cookie', `b0_auth_role=; Path=/${domainAttr}; Max-Age=0; SameSite=Lax`);
}

// ==========================================
// 🔑 UNIVERSAL AUTH API HANDLER
// ==========================================

async function handleAuthApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const hasKV = !!(env && env.TEACHER_KV);
  if (!hasKV) {
    return new Response(JSON.stringify({ error: 'Cloudflare KV 存储服务未绑定' }), { status: 503, headers: corsHeaders });
  }

  try {
    // 1. GET /api/auth/me - 当前登录状态
    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = await getAuthUser(request, env);
      if (!user) {
        return new Response(JSON.stringify({
          success: true,
          authenticated: false,
          user: null,
          role: 'guest',
        }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({
        success: true,
        authenticated: true,
        user: {
          uid: user.uid,
          username: user.username,
          role: user.role,
        },
      }), { headers: corsHeaders });
    }

    // 2. POST /api/auth/register - 极速注册 (包含密保邮箱，静默白名单判定 Admin)
    if (path === '/api/auth/register' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { username, email, password, adminKey } = body;

      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanEmail = String(email || '').trim().toLowerCase();

      if (!cleanUser || cleanUser.length < 3 || cleanUser.length > 24) {
        return new Response(JSON.stringify({ error: '用户名需为 3-24 位字符' }), { status: 400, headers: corsHeaders });
      }

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return new Response(JSON.stringify({ error: '请提供有效的密保邮箱（用于忘记密码时安全找回）' }), { status: 400, headers: corsHeaders });
      }

      if (!password || String(password).length < 6) {
        return new Response(JSON.stringify({ error: '密码长度至少需为 6 位' }), { status: 400, headers: corsHeaders });
      }

      const userKey = `auth:user:${cleanUser}`;
      const existing = await env.TEACHER_KV.get(userKey, 'json');
      if (existing) {
        return new Response(JSON.stringify({ error: '该用户名已被注册，请直接登录' }), { status: 409, headers: corsHeaders });
      }

      // 检查密保邮箱是否已被占用
      const emailIndexKey = `auth:email:${cleanEmail}`;
      const existingEmailOwner = await env.TEACHER_KV.get(emailIndexKey);
      if (existingEmailOwner && existingEmailOwner !== cleanUser) {
        return new Response(JSON.stringify({ error: '该密保邮箱已被其他账号使用，请更换' }), { status: 409, headers: corsHeaders });
      }

      // 角色判断：优先走隐蔽的静默白名单，向后兼容保留可选 adminKey
      const isWhitelistAdmin = checkIsAdminUser(cleanUser, cleanEmail, env);
      const isKeyAdmin = adminKey && String(adminKey).trim() === getAdminInitKey(env);
      const role = (isWhitelistAdmin || isKeyAdmin) ? 'admin' : 'user';

      const salt = crypto.randomUUID().slice(0, 8);
      const hash = await sha256Hex(`${password}:${salt}`);
      const uid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

      const userRecord = {
        uid,
        username: cleanUser,
        email: cleanEmail,
        salt,
        hash,
        role,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };

      await env.TEACHER_KV.put(userKey, JSON.stringify(userRecord));
      await env.TEACHER_KV.put(emailIndexKey, cleanUser);

      // 签发 Token 并写入统一 Cookie
      const token = await signToken({ uid, username: cleanUser, role }, getJwtSecret(env));
      const headers = new Headers(corsHeaders);
      appendAuthCookies(headers, token, role, request.url);

      return new Response(JSON.stringify({
        success: true,
        user: { uid, username: cleanUser, role },
        token,
        message: role === 'admin' ? '注册成功，已激活管理员特权！' : '注册成功，欢迎加入！',
      }), { headers });
    }

    // 3. POST /api/auth/login - 登录 (支持用户名或密保邮箱，带防撞库频控)
    if (path === '/api/auth/login' && request.method === 'POST') {
      const canAttempt = await checkLoginRateLimit(request, env);
      if (!canAttempt) {
        return new Response(JSON.stringify({ error: '登录失败次数过多，请稍候 5 分钟后再试' }), { status: 429, headers: corsHeaders });
      }

      const body = await request.json().catch(() => ({}));
      const { username, password } = body;

      const cleanInput = String(username || '').trim().toLowerCase();
      if (!cleanInput || !password) {
        return new Response(JSON.stringify({ error: '请输入用户名或密保邮箱' }), { status: 400, headers: corsHeaders });
      }

      let targetUser = cleanInput;
      // 若输入的是邮箱格式，先反查对应的用户名
      if (cleanInput.includes('@')) {
        const mappedUser = await env.TEACHER_KV.get(`auth:email:${cleanInput}`);
        if (mappedUser) {
          targetUser = mappedUser;
        }
      }

      const userKey = `auth:user:${targetUser}`;
      const existing = await env.TEACHER_KV.get(userKey, 'json');

      if (!existing) {
        await recordLoginFailure(request, env);
        return new Response(JSON.stringify({ error: '用户不存在，请先注册' }), { status: 404, headers: corsHeaders });
      }

      const checkHash = await sha256Hex(`${password}:${existing.salt}`);
      if (checkHash !== existing.hash) {
        await recordLoginFailure(request, env);
        return new Response(JSON.stringify({ error: '密码错误，请重新输入' }), { status: 401, headers: corsHeaders });
      }

      // 成功登录，清除频控惩罚
      await clearLoginFailure(request, env);

      existing.lastLoginAt = Date.now();
      await env.TEACHER_KV.put(userKey, JSON.stringify(existing));

      const token = await signToken({ uid: existing.uid, username: existing.username, role: existing.role || 'user' }, getJwtSecret(env));
      const headers = new Headers(corsHeaders);
      appendAuthCookies(headers, token, existing.role || 'user', request.url);

      return new Response(JSON.stringify({
        success: true,
        user: { uid: existing.uid, username: existing.username, role: existing.role || 'user' },
        token,
        message: '登录成功',
      }), { headers });
    }

    // 4. POST /api/auth/reset-password - 凭密保邮箱重置密码
    if (path === '/api/auth/reset-password' && request.method === 'POST') {
      const canAttempt = await checkLoginRateLimit(request, env);
      if (!canAttempt) {
        return new Response(JSON.stringify({ error: '尝试次数过多，请稍候 5 分钟后再试' }), { status: 429, headers: corsHeaders });
      }

      const body = await request.json().catch(() => ({}));
      const { username, email, newPassword } = body;

      const cleanUser = String(username || '').trim().toLowerCase();
      const cleanEmail = String(email || '').trim().toLowerCase();

      if (!cleanUser || !cleanEmail || !newPassword) {
        return new Response(JSON.stringify({ error: '请完整输入用户名、密保邮箱与新密码' }), { status: 400, headers: corsHeaders });
      }

      if (String(newPassword).length < 6) {
        return new Response(JSON.stringify({ error: '新密码长度至少需为 6 位' }), { status: 400, headers: corsHeaders });
      }

      const userKey = `auth:user:${cleanUser}`;
      const existing = await env.TEACHER_KV.get(userKey, 'json');

      if (!existing) {
        await recordLoginFailure(request, env);
        return new Response(JSON.stringify({ error: '未找到该用户，请检查用户名是否正确' }), { status: 404, headers: corsHeaders });
      }

      if (!existing.email) {
        return new Response(JSON.stringify({ error: '该早期账号未设定密保邮箱，请联系管理员处理' }), { status: 400, headers: corsHeaders });
      }

      if (existing.email.toLowerCase() !== cleanEmail) {
        await recordLoginFailure(request, env);
        return new Response(JSON.stringify({ error: '用户名与绑定的密保邮箱不匹配，请核对后重试' }), { status: 403, headers: corsHeaders });
      }

      await clearLoginFailure(request, env);

      const newSalt = crypto.randomUUID().slice(0, 8);
      const newHash = await sha256Hex(`${newPassword}:${newSalt}`);

      existing.salt = newSalt;
      existing.hash = newHash;
      existing.passwordResetAt = Date.now();

      await env.TEACHER_KV.put(userKey, JSON.stringify(existing));

      return new Response(JSON.stringify({
        success: true,
        message: '密码重置成功！请使用新密码重新登录。',
      }), { headers: corsHeaders });
    }

    // 5. POST /api/auth/logout - 退出登录
    if (path === '/api/auth/logout' && request.method === 'POST') {
      const headers = new Headers(corsHeaders);
      appendClearCookies(headers, request.url);
      return new Response(JSON.stringify({ success: true, message: '已安全退出登录' }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Auth API Error: ' + err.message }), { status: 500, headers: corsHeaders });
  }
}

// ==========================================
// 📦 NETBOM API (Cloud Sync & Personal Projects)
// ==========================================

async function handleBomApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const hasKV = !!(env && env.TEACHER_KV);

  try {
    // ----------------------------------------------------
    // 1. 个人云端工程管理 (必须登录: User 或 Admin)
    // ----------------------------------------------------
    if (path === '/api/bom/projects') {
      const user = await getAuthUser(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: '请先登录以访问个人云端报价工程', needAuth: true }), { status: 401, headers: corsHeaders });
      }

      if (!hasKV) {
        return new Response(JSON.stringify({ error: '云端存储服务未就绪' }), { status: 503, headers: corsHeaders });
      }

      const userProjectsKey = `bom:user:${user.uid}:projects`;

      // GET /api/bom/projects - 拉取当前登录用户的工程列表或特定工程
      if (request.method === 'GET') {
        const targetId = url.searchParams.get('id');
        const isSummaryOnly = url.searchParams.get('summary') === '1';
        const rawProjects = (await env.TEACHER_KV.get(userProjectsKey, 'json')) || [];

        // 1. 若请求具体单个工程详情
        if (targetId) {
          const found = rawProjects.find((p) => p.id === targetId);
          if (!found) {
            return new Response(JSON.stringify({ error: '未找到指定工程' }), { status: 404, headers: corsHeaders });
          }
          return new Response(JSON.stringify({
            success: true,
            project: found,
            serverTime: Date.now(),
          }), { headers: corsHeaders });
        }

        // 2. 若仅需摘要模式 (轻量快速加载)
        if (isSummaryOnly) {
          const summaryList = rawProjects.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description || '',
            summary: p.summary || {},
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
          }));
          return new Response(JSON.stringify({
            success: true,
            username: user.username,
            projects: summaryList,
            serverTime: Date.now(),
          }), { headers: corsHeaders });
        }

        // 3. 默认返回全量列表
        return new Response(JSON.stringify({
          success: true,
          username: user.username,
          projects: rawProjects,
          serverTime: Date.now(),
        }), { headers: corsHeaders });
      }

      // POST /api/bom/projects - 创建或覆盖更新工程
      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { id, name, description, payload, summary } = body;

        const cleanName = String(name || '').trim();
        if (!cleanName) {
          return new Response(JSON.stringify({ error: '工程名称不能为空' }), { status: 400, headers: corsHeaders });
        }

        if (!payload) {
          return new Response(JSON.stringify({ error: 'BOM 数据载荷不能为空' }), { status: 400, headers: corsHeaders });
        }

        let projects = (await env.TEACHER_KV.get(userProjectsKey, 'json')) || [];
        const now = Date.now();
        let targetProject = null;

        if (id) {
          // 覆盖已有工程
          const idx = projects.findIndex((p) => p.id === id);
          if (idx >= 0) {
            projects[idx] = {
              ...projects[idx],
              name: cleanName,
              description: description || '',
              summary: summary || {},
              payload,
              updatedAt: now,
            };
            targetProject = projects[idx];
          }
        }

        if (!targetProject) {
          // 创建新工程 (加入首位，最大保留 60 个工程)
          const newId = 'proj_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
          targetProject = {
            id: newId,
            name: cleanName,
            description: description || '',
            summary: summary || {},
            payload,
            createdAt: now,
            updatedAt: now,
          };
          projects.unshift(targetProject);
          if (projects.length > 60) {
            projects = projects.slice(0, 60);
          }
        }

        await env.TEACHER_KV.put(userProjectsKey, JSON.stringify(projects));

        return new Response(JSON.stringify({
          success: true,
          project: targetProject,
          message: '个人工程已成功同步至云端',
        }), { headers: corsHeaders });
      }

      // DELETE /api/bom/projects?id=xxx - 删除个人工程
      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) {
          return new Response(JSON.stringify({ error: '请指定要删除的工程 ID' }), { status: 400, headers: corsHeaders });
        }

        let projects = (await env.TEACHER_KV.get(userProjectsKey, 'json')) || [];
        projects = projects.filter((p) => p.id !== id);
        await env.TEACHER_KV.put(userProjectsKey, JSON.stringify(projects));

        return new Response(JSON.stringify({
          success: true,
          id,
          message: '工程已删除',
        }), { headers: corsHeaders });
      }
    }

    // 1.1 批量导入恢复工程备份
    if (path === '/api/bom/projects/import' && request.method === 'POST') {
      const user = await getAuthUser(request, env);
      if (!user) {
        return new Response(JSON.stringify({ error: '请先登录以导入个人工程', needAuth: true }), { status: 401, headers: corsHeaders });
      }

      if (!hasKV) {
        return new Response(JSON.stringify({ error: '云端存储服务未就绪' }), { status: 503, headers: corsHeaders });
      }

      const body = await request.json().catch(() => ({}));
      const incomingList = Array.isArray(body.projects) ? body.projects : [];

      if (incomingList.length === 0) {
        return new Response(JSON.stringify({ error: '导入数据中未包含有效工程列表' }), { status: 400, headers: corsHeaders });
      }

      const userProjectsKey = `bom:user:${user.uid}:projects`;
      let currentProjects = (await env.TEACHER_KV.get(userProjectsKey, 'json')) || [];

      // 合并逻辑：若 ID 已存在则跳过或更新，否则加入
      let addedCount = 0;
      for (const item of incomingList) {
        if (!item.name || !item.payload) continue;
        const exists = currentProjects.some((p) => p.id === item.id);
        if (!exists) {
          currentProjects.unshift(item);
          addedCount++;
        }
      }

      if (currentProjects.length > 60) {
        currentProjects = currentProjects.slice(0, 60);
      }

      await env.TEACHER_KV.put(userProjectsKey, JSON.stringify(currentProjects));

      return new Response(JSON.stringify({
        success: true,
        importedCount: addedCount,
        totalCount: currentProjects.length,
        projects: currentProjects,
        message: `成功恢复 ${addedCount} 个工程备份！`,
      }), { headers: corsHeaders });
    }

    // ----------------------------------------------------
    // 2. 全网官方默认配置 (GET 所有公开 / POST 仅 Admin)
    // ----------------------------------------------------
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

    if (path === '/api/bom/publish-default' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { adminKey, payload } = body;

      // 双重认证：支持携带 adminKey 或者已登录 Admin 角色账号
      const user = await getAuthUser(request, env);
      const isAdminUser = user && user.role === 'admin';
      const isValidAdminKey = adminKey && String(adminKey).trim() === getAdminInitKey(env);

      if (!isAdminUser && !isValidAdminKey) {
        return new Response(JSON.stringify({ error: '权限不足：仅管理员允许发布全网默认版本' }), { status: 403, headers: corsHeaders });
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
        publishedBy: user ? user.username : 'admin',
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

    // ----------------------------------------------------
    // 3. 项目码提取与分享 (原有协作码机制，向后完全兼容)
    // ----------------------------------------------------
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

// ==========================================
// 🎓 TEACHER WORKSPACE API (Existing)
// ==========================================

async function handleTeacherApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const hasKV = !!(env && env.TEACHER_KV);

    if (path === '/api/teacher/status') {
      return new Response(JSON.stringify({
        status: 'ok',
        kvAvailable: hasKV,
        serverTime: Date.now(),
        message: hasKV ? 'Cloudflare KV 边缘同步已就绪' : '本地/单机优先运行中'
      }), { headers: corsHeaders });
    }

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
