/**
 * bin0sky Edge Gateway & Unified IdP Worker
 * Single-domain unified routing, SSO Authentication, RBAC + Entitlements, & Edge APIs:
 *   bin0sky.tech/api/auth/*     -> Universal SSO Auth, Session Revocation & Password Management
 *   bin0sky.tech/api/admin/*    -> Entitlements Management, Admin Reset & KV->D1 Migration
 *   bin0sky.tech/api/bom/*      -> NetBOM D1 Projects, Global Defaults & Collaboration Sync
 *   bin0sky.tech/{subapp}/*     -> Reverse Proxy to Subdomain Apps
 *   Everything else             -> bin0sky.tech Static Assets (ASSETS)
 */

const ALL_SCOPES = [
  'labs:golden_goose',
  'netbom:cost_view',
  'netbom:publish',
  'ambient:vip',
  'slidecraft:pro',
];

const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days
const SESSION_CACHE_TTL_SEC = 60; // Cloudflare KV minimum TTL (60s)
const MAX_BOM_PROJECTS = 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, search } = url;

    // 0. Edge APIs
    if (pathname.startsWith('/api/auth/')) {
      return handleAuthApi(request, env);
    }
    if (pathname.startsWith('/api/admin/')) {
      return handleAdminApi(request, env);
    }
    if (pathname.startsWith('/api/bom/')) {
      return handleBomApi(request, env);
    }

    // Archived route redirect: /teacher -> / (302)
    const cleanPath = pathname.replace(/\/+$/, '');
    if (cleanPath === '/teacher' || pathname.startsWith('/teacher/')) {
      return Response.redirect(`${url.origin}/`, 302);
    }

    // Direct app routes: Redirect to App Shell workstation hash navigation
    const hashRoutes = {
      '/icon': '#/icon',
      '/ppt': '#/ppt',
      '/console': '#/console',
      '/ambient': '#/ambient',
      '/bom': '#/bom',
      '/nettest': '#/nettest',
      '/mdview': '#/mdview',
      '/radio': '#/radio',
      '/apps': '#/apps',
      '/notes': '#/notes',
      '/labs': '#/labs',
      '/golden-goose': '#/golden-goose',
      '/population': '#/population',
      '/fund-cycle': '#/fund-cycle',
      '/fund-breakdown': '#/fund-breakdown',
    };

    if (hashRoutes[cleanPath]) {
      return Response.redirect(`${url.origin}/${hashRoutes[cleanPath]}`, 302);
    }

    // Edge Security: Protect Golden Goose Lab (requires verified D1 session & labs:golden_goose / admin)
    let decodedPath = pathname.toLowerCase();
    try {
      decodedPath = decodeURIComponent(pathname).toLowerCase();
    } catch (e) {}
    if (decodedPath.includes('golden_goose')) {
      const user = await authenticateRequest(request, env);
      if (!requireScope(user, 'labs:golden_goose')) {
        const redirectTarget = encodeURIComponent(`${pathname}${search}`);
        return Response.redirect(`${url.origin}/#login?redirect_uri=${redirectTarget}`, 302);
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
      { prefix: '/mdview', target: 'https://mdview.bin0sky.tech' },
      { prefix: '/radio', target: 'https://radio.bin0sky.tech' },
    ];

    for (const route of routes) {
      if (pathname.startsWith(route.prefix + '/')) {
        const subPath = pathname.slice(route.prefix.length) || '/';
        const targetUrl = `${route.target}${subPath}${search}`;

        const newHeaders = new Headers(request.headers);
        newHeaders.set('X-Forwarded-Host', url.host);

        return fetch(new Request(targetUrl, {
          method: request.method,
          headers: newHeaders,
          body: request.body,
          redirect: 'follow',
        }));
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

    // Default: serve static assets bound via ASSETS (or pass through)
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return fetch(request);
  },
};

// ==========================================
// 🛡️ AUTH, CRYPTO, CORS & SESSION HELPERS
// ==========================================

function getAdminInitKey(env) {
  const val = env && env.ADMIN_INIT_KEY ? String(env.ADMIN_INIT_KEY).trim() : '';
  return val || null;
}

function getJwtSecret(env) {
  const val = env && env.JWT_SECRET ? String(env.JWT_SECRET).trim() : '';
  return val || null;
}

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

function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  if (origin === 'https://bin0sky.tech') return true;
  if (/^https:\/\/[a-z0-9-]+\.bin0sky\.tech$/i.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
}

function getAuthCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = isAllowedCorsOrigin(origin);
  const headers = {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://bin0sky.tech',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Vary': 'Origin',
  };
  if (allowed) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function jsonResponse(corsHeaders, body, status = 200, extraHeaders = null) {
  const headers = new Headers(corsHeaders);
  if (extraHeaders) {
    for (const [k, v] of extraHeaders.entries()) {
      headers.append(k, v);
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
}

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

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashSaltedPassword(password, salt) {
  return sha256Hex(`${password}:${salt}`);
}

/**
 * Verifies user password against stored hash.
 * Supports both salted SHA-256 hashes and legacy client-hashed Teacher KV entries.
 */
async function verifyUserPassword(plainOrClientHash, userRow, options = { allowRawClientSha256: false }) {
  if (!userRow || !userRow.password_hash) return false;
  const input = String(plainOrClientHash || '');
  if (!input) return false;

  if (userRow.salt === 'legacy_sha256') {
    if (options.allowRawClientSha256 && /^[a-f0-9]{64}$/i.test(input) && input === userRow.password_hash) {
      return true;
    }
    const clientStyleHash = await sha256Hex(input);
    return clientStyleHash === userRow.password_hash;
  }

  const expected = await hashSaltedPassword(input, userRow.salt);
  return expected === userRow.password_hash;
}

async function signToken(payload, secret, expiresAt = Date.now() + SESSION_TTL_MS) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('JWT_SECRET is not configured');
  }
  const data = JSON.stringify({ ...payload, exp: expiresAt });
  const base64Data = btoa(unescape(encodeURIComponent(data)));

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
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
  if (!token || typeof token !== 'string' || !secret || typeof secret !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [base64Data, sig] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
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
    const trimmed = c.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1);
      try {
        cookies[k] = decodeURIComponent(v);
      } catch (e) {
        cookies[k] = v;
      }
    }
  });
  return cookies;
}

function extractRequestToken(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  const cookies = parseCookies(request);
  return cookies['b0_token'] || null;
}

function appendAuthCookies(headers, token, role, requestUrl) {
  const url = new URL(requestUrl);
  const isProd = url.hostname.includes('bin0sky.tech');
  const domainAttr = isProd ? '; Domain=.bin0sky.tech' : '';
  const secureAttr = isProd ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);

  headers.append('Set-Cookie', `b0_token=${token}; Path=/${domainAttr}; Max-Age=${maxAge}; SameSite=Lax; HttpOnly${secureAttr}`);
  headers.append('Set-Cookie', `b0_auth_role=${role}; Path=/${domainAttr}; Max-Age=${maxAge}; SameSite=Lax${secureAttr}`);
}

function appendClearCookies(headers, requestUrl) {
  const url = new URL(requestUrl);
  const isProd = url.hostname.includes('bin0sky.tech');
  const domainAttr = isProd ? '; Domain=.bin0sky.tech' : '';
  const secureAttr = isProd ? '; Secure' : '';

  headers.append('Set-Cookie', `b0_token=; Path=/${domainAttr}; Max-Age=0; SameSite=Lax; HttpOnly${secureAttr}`);
  headers.append('Set-Cookie', `b0_auth_role=; Path=/${domainAttr}; Max-Age=0; SameSite=Lax${secureAttr}`);
}

function requireScope(user, scope) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.scopes) && user.scopes.includes(scope);
}

async function resolveUserScopes(db, uid, role) {
  if (role === 'admin') {
    return [...ALL_SCOPES];
  }
  const now = Date.now();
  const { results } = await db
    .prepare('SELECT scope, expires_at FROM user_entitlements WHERE uid = ?')
    .bind(uid)
    .all();

  const scopes = [];
  for (const row of results || []) {
    if (row.expires_at === null || row.expires_at === undefined || Number(row.expires_at) > now) {
      if (row.scope && !scopes.includes(row.scope)) {
        scopes.push(row.scope);
      }
    }
  }
  return scopes;
}

async function invalidateUserSessionsCache(env, uid) {
  if (!env || !env.DB || !env.TEACHER_KV) return;
  const now = Date.now();
  const { results } = await env.DB
    .prepare('SELECT jti FROM sessions WHERE uid = ? AND revoked_at IS NULL AND expires_at > ?')
    .bind(uid, now)
    .all();
  await Promise.all(
    (results || []).map((r) => env.TEACHER_KV.delete(`sess:${r.jti}`))
  );
}

async function revokeUserSessions(env, uid) {
  if (!env || !env.DB) return;
  const now = Date.now();
  await invalidateUserSessionsCache(env, uid);
  await env.DB
    .prepare('UPDATE sessions SET revoked_at = ? WHERE uid = ? AND revoked_at IS NULL')
    .bind(now, uid)
    .run();
}

async function createSessionAndToken(request, env, userRow, scopes) {
  const jwtSecret = getJwtSecret(env);
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured');

  const jti = 'ses_' + crypto.randomUUID().replace(/-/g, '');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const ua = (request.headers.get('User-Agent') || '').slice(0, 256);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  await env.DB
    .prepare('INSERT INTO sessions (jti, uid, user_agent, ip, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)')
    .bind(jti, userRow.uid, ua, ip, expiresAt)
    .run();

  const token = await signToken(
    { uid: userRow.uid, username: userRow.username, role: userRow.role, jti },
    jwtSecret,
    expiresAt
  );

  const identity = {
    uid: userRow.uid,
    username: userRow.username,
    role: userRow.role,
    scopes,
    mustChangePassword: Boolean(userRow.must_change_password),
    jti,
    expiresAt,
  };

  if (env.TEACHER_KV) {
    await env.TEACHER_KV.put(`sess:${jti}`, JSON.stringify(identity), {
      expirationTtl: SESSION_CACHE_TTL_SEC,
    });
  }

  return { token, identity };
}

/**
 * Unified Auth Middleware:
 * Extracts token -> verifies HMAC -> checks KV session cache or D1 sessions + users + user_entitlements.
 * Returns { uid, username, role, scopes, mustChangePassword, jti } or null.
 */
async function authenticateRequest(request, env) {
  const token = extractRequestToken(request);
  if (!token) return null;

  const secret = getJwtSecret(env);
  if (!secret) return null;

  const payload = await verifyToken(token, secret);
  if (!payload || !payload.uid || !payload.jti) return null;

  const now = Date.now();

  // Fast path: 60s KV session cache
  if (env && env.TEACHER_KV) {
    const cached = await env.TEACHER_KV.get(`sess:${payload.jti}`, 'json');
    if (cached && cached.uid === payload.uid && cached.expiresAt > now) {
      return {
        uid: cached.uid,
        username: cached.username,
        role: cached.role,
        scopes: Array.isArray(cached.scopes) ? cached.scopes : [],
        mustChangePassword: Boolean(cached.mustChangePassword),
        jti: payload.jti,
      };
    }
  }

  if (!env || !env.DB) return null;

  const row = await env.DB
    .prepare(
      `SELECT s.jti, s.expires_at, s.revoked_at,
              u.uid, u.username, u.role, u.status, u.must_change_password
       FROM sessions s
       JOIN users u ON s.uid = u.uid
       WHERE s.jti = ?`
    )
    .bind(payload.jti)
    .first();

  if (!row) return null;
  if (row.revoked_at !== null && row.revoked_at !== undefined) return null;
  if (Number(row.expires_at) <= now) return null;
  if (row.status !== 'active') return null;

  const scopes = await resolveUserScopes(env.DB, row.uid, row.role);
  const identity = {
    uid: row.uid,
    username: row.username,
    role: row.role,
    scopes,
    mustChangePassword: Boolean(row.must_change_password),
    jti: row.jti,
  };

  if (env.TEACHER_KV) {
    await env.TEACHER_KV.put(
      `sess:${row.jti}`,
      JSON.stringify({ ...identity, expiresAt: Number(row.expires_at) }),
      { expirationTtl: SESSION_CACHE_TTL_SEC }
    );
  }

  return identity;
}

async function getAuthUser(request, env) {
  return authenticateRequest(request, env);
}

function validateScopeFormat(scope) {
  return /^[a-z0-9_]+:[a-z0-9_]+$/i.test(String(scope || '').trim());
}

// ==========================================
// 🔑 UNIVERSAL AUTH API HANDLER (/api/auth/*)
// ==========================================

async function handleAuthApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!env || !env.DB) {
    return jsonResponse(corsHeaders, { error: 'Cloudflare D1 数据库未绑定' }, 503);
  }

  const jwtSecret = getJwtSecret(env);
  if (!jwtSecret) {
    return jsonResponse(corsHeaders, { error: '服务端未配置 JWT_SECRET 环境变量，认证服务已拒绝响应' }, 503);
  }

  try {
    // 1. GET /api/auth/me - 当前登录状态与完整权限清单
    if (path === '/api/auth/me' && request.method === 'GET') {
      const user = await authenticateRequest(request, env);
      if (!user) {
        return jsonResponse(corsHeaders, {
          success: true,
          authenticated: false,
          uid: null,
          username: null,
          role: 'guest',
          scopes: [],
          mustChangePassword: false,
          user: null,
        });
      }

      const publicUser = {
        uid: user.uid,
        username: user.username,
        role: user.role,
        scopes: user.scopes,
        mustChangePassword: user.mustChangePassword,
      };
      return jsonResponse(corsHeaders, {
        success: true,
        authenticated: true,
        ...publicUser,
        user: publicUser,
      });
    }

    // 2. POST /api/auth/register - 统一注册并签发 D1 会话
    if (path === '/api/auth/register' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const cleanUser = String(body.username || '').trim().toLowerCase();
      const cleanEmail = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const adminKey = body.adminKey;

      if (!cleanUser || cleanUser.length < 3 || cleanUser.length > 24) {
        return jsonResponse(corsHeaders, { error: '用户名需为 3-24 位字符' }, 400);
      }
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return jsonResponse(corsHeaders, { error: '请提供有效的邮箱地址' }, 400);
      }
      if (password.length < 6) {
        return jsonResponse(corsHeaders, { error: '密码长度至少需为 6 位' }, 400);
      }

      const dupUser = await env.DB
        .prepare('SELECT uid, username, email FROM users WHERE username = ? OR email = ?')
        .bind(cleanUser, cleanEmail)
        .first();
      if (dupUser) {
        const msg = dupUser.username === cleanUser
          ? '该用户名已被注册，请直接登录'
          : '该邮箱已被其他账号使用，请更换';
        return jsonResponse(corsHeaders, { error: msg }, 409);
      }

      const isWhitelistAdmin = checkIsAdminUser(cleanUser, cleanEmail, env);
      const adminInitKey = getAdminInitKey(env);
      const isKeyAdmin = !!(adminInitKey && adminKey && String(adminKey).trim() === adminInitKey);
      const role = (isWhitelistAdmin || isKeyAdmin) ? 'admin' : 'user';

      const salt = crypto.randomUUID().slice(0, 8);
      const passwordHash = await hashSaltedPassword(password, salt);
      const uid = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const now = Date.now();

      await env.DB
        .prepare(
          `INSERT INTO users (uid, username, email, password_hash, salt, role, status, must_change_password, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`
        )
        .bind(uid, cleanUser, cleanEmail, passwordHash, salt, role, now, now)
        .run();

      const scopes = await resolveUserScopes(env.DB, uid, role);
      const userRow = { uid, username: cleanUser, role, must_change_password: 0 };
      const { token } = await createSessionAndToken(request, env, userRow, scopes);

      const cookieHeaders = new Headers();
      appendAuthCookies(cookieHeaders, token, role, request.url);

      const publicUser = { uid, username: cleanUser, role, scopes, mustChangePassword: false };
      return jsonResponse(
        corsHeaders,
        {
          success: true,
          ...publicUser,
          user: publicUser,
          token,
          message: role === 'admin' ? '注册成功，已激活管理员特权！' : '注册成功，欢迎加入！',
        },
        200,
        cookieHeaders
      );
    }

    // 3. POST /api/auth/login - 统一登录（支持用户名或邮箱 + 频控保护）
    if (path === '/api/auth/login' && request.method === 'POST') {
      const canAttempt = await checkLoginRateLimit(request, env);
      if (!canAttempt) {
        return jsonResponse(corsHeaders, { error: '登录失败次数过多，请稍候 5 分钟后再试' }, 429);
      }

      const body = await request.json().catch(() => ({}));
      const cleanInput = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!cleanInput || !password) {
        return jsonResponse(corsHeaders, { error: '请输入用户名/邮箱与密码' }, 400);
      }

      let existing = await env.DB
        .prepare('SELECT uid, username, email, password_hash, salt, role, status, must_change_password FROM users WHERE username = ? OR email = ?')
        .bind(cleanInput, cleanInput)
        .first();

      // Seamless KV -> D1 fallback for pre-migration accounts (avoids bootstrap lockouts)
      if (!existing && env.TEACHER_KV) {
        let targetUser = cleanInput;
        if (cleanInput.includes('@')) {
          const mapped = await env.TEACHER_KV.get(`auth:email:${cleanInput}`);
          if (mapped) targetUser = String(mapped).trim().toLowerCase();
        }
        const kvRec = await env.TEACHER_KV.get(`auth:user:${targetUser}`, 'json');
        if (kvRec && kvRec.username) {
          await upsertKvAuthUserToD1(env.DB, kvRec, 'lazy_login');
          existing = await env.DB
            .prepare('SELECT uid, username, email, password_hash, salt, role, status, must_change_password FROM users WHERE username = ? OR email = ?')
            .bind(cleanInput, cleanInput)
            .first();
        }
      }

      if (!existing) {
        await recordLoginFailure(request, env);
        return jsonResponse(corsHeaders, { error: '用户不存在，请先注册' }, 404);
      }
      if (existing.status !== 'active') {
        return jsonResponse(corsHeaders, { error: '该账号已被禁用，请联系管理员' }, 403);
      }

      const validPwd = await verifyUserPassword(password, existing);
      if (!validPwd) {
        await recordLoginFailure(request, env);
        return jsonResponse(corsHeaders, { error: '密码错误，请重新输入' }, 401);
      }

      await clearLoginFailure(request, env);
      await env.DB.prepare('UPDATE users SET updated_at = ? WHERE uid = ?').bind(Date.now(), existing.uid).run();

      const scopes = await resolveUserScopes(env.DB, existing.uid, existing.role || 'user');
      const { token } = await createSessionAndToken(request, env, existing, scopes);

      const cookieHeaders = new Headers();
      appendAuthCookies(cookieHeaders, token, existing.role || 'user', request.url);

      const publicUser = {
        uid: existing.uid,
        username: existing.username,
        role: existing.role || 'user',
        scopes,
        mustChangePassword: Boolean(existing.must_change_password),
      };
      return jsonResponse(
        corsHeaders,
        {
          success: true,
          ...publicUser,
          user: publicUser,
          token,
          message: publicUser.mustChangePassword ? '登录成功，请尽快修改默认/迁移密码' : '登录成功',
        },
        200,
        cookieHeaders
      );
    }

    // 4. POST /api/auth/reset-password - 暂时关闭无邮件验证码的自助重置密码
    if (path === '/api/auth/reset-password' && request.method === 'POST') {
      return jsonResponse(
        corsHeaders,
        {
          error: '出于安全原因，无邮件验证码的自助重置密码已关闭。请登录后在账号设置中修改密码，或联系管理员后台重置。',
          code: 'SELF_RESET_DISABLED',
        },
        403
      );
    }

    // 5. POST /api/auth/change-password - 已登录用户校验旧密码后修改密码，并踢下线全端历史会话
    if (path === '/api/auth/change-password' && request.method === 'POST') {
      const authUser = await authenticateRequest(request, env);
      if (!authUser) {
        return jsonResponse(corsHeaders, { error: '请先登录后再修改密码', needAuth: true }, 401);
      }

      const body = await request.json().catch(() => ({}));
      const oldPassword = String(body.oldPassword || '');
      const newPassword = String(body.newPassword || '');

      if (!oldPassword || newPassword.length < 6) {
        return jsonResponse(corsHeaders, { error: '请提供当前密码与至少 6 位的新密码' }, 400);
      }

      const userRow = await env.DB
        .prepare('SELECT uid, username, password_hash, salt FROM users WHERE uid = ?')
        .bind(authUser.uid)
        .first();
      if (!userRow) {
        return jsonResponse(corsHeaders, { error: '用户不存在' }, 404);
      }

      const validOld = await verifyUserPassword(oldPassword, userRow);
      if (!validOld) {
        return jsonResponse(corsHeaders, { error: '原密码校验失败' }, 401);
      }

      const newSalt = crypto.randomUUID().slice(0, 8);
      const newHash = await hashSaltedPassword(newPassword, newSalt);
      const now = Date.now();

      await env.DB
        .prepare('UPDATE users SET password_hash = ?, salt = ?, must_change_password = 0, updated_at = ? WHERE uid = ?')
        .bind(newHash, newSalt, now, authUser.uid)
        .run();

      // Revoke ALL sessions for this user across every device
      await revokeUserSessions(env, authUser.uid);

      const cookieHeaders = new Headers();
      appendClearCookies(cookieHeaders, request.url);

      return jsonResponse(
        corsHeaders,
        {
          success: true,
          requireRelogin: true,
          message: '密码修改成功！所有设备旧会话已吊销，请使用新密码重新登录。',
        },
        200,
        cookieHeaders
      );
    }

    // 6. POST /api/auth/logout - 主动吊销当前会话并清理 Cookie
    if (path === '/api/auth/logout' && request.method === 'POST') {
      const token = extractRequestToken(request);
      if (token) {
        const payload = await verifyToken(token, jwtSecret);
        if (payload && payload.jti) {
          await env.DB
            .prepare('UPDATE sessions SET revoked_at = ? WHERE jti = ? AND revoked_at IS NULL')
            .bind(Date.now(), payload.jti)
            .run();
          if (env.TEACHER_KV) {
            await env.TEACHER_KV.delete(`sess:${payload.jti}`);
          }
        }
      }

      const cookieHeaders = new Headers();
      appendClearCookies(cookieHeaders, request.url);
      return jsonResponse(corsHeaders, { success: true, message: '已安全退出登录，当前会话已吊销' }, 200, cookieHeaders);
    }

    return jsonResponse(corsHeaders, { error: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: 'Auth API Error: ' + err.message }, 500);
  }
}

// ==========================================
// 🛡️ ADMIN API HANDLER (/api/admin/*)
// ==========================================

async function lookupTargetUser(db, uid, username) {
  if (uid) {
    return db.prepare('SELECT uid, username, email, role, status FROM users WHERE uid = ?').bind(String(uid).trim()).first();
  }
  if (username) {
    return db
      .prepare('SELECT uid, username, email, role, status FROM users WHERE username = ?')
      .bind(String(username).trim().toLowerCase())
      .first();
  }
  return null;
}

async function handleAdminApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!env || !env.DB) {
    return jsonResponse(corsHeaders, { error: 'Cloudflare D1 数据库未绑定' }, 503);
  }

  const admin = await authenticateRequest(request, env);
  if (!admin) {
    return jsonResponse(corsHeaders, { error: '未登录或会话已失效', needAuth: true }, 401);
  }
  if (admin.role !== 'admin') {
    return jsonResponse(corsHeaders, { error: '权限不足：仅管理员可执行此操作' }, 403);
  }

  try {
    // 1. GET /api/admin/entitlements - 查询指定用户权益或列出用户与权益概览
    if (path === '/api/admin/entitlements' && request.method === 'GET') {
      const uid = url.searchParams.get('uid');
      const username = url.searchParams.get('username');

      if (uid || username) {
        const target = await lookupTargetUser(env.DB, uid, username);
        if (!target) {
          return jsonResponse(corsHeaders, { error: '目标用户不存在' }, 404);
        }
        const { results: entitlements } = await env.DB
          .prepare('SELECT scope, expires_at, granted_by, created_at FROM user_entitlements WHERE uid = ? ORDER BY created_at DESC')
          .bind(target.uid)
          .all();
        const effectiveScopes = await resolveUserScopes(env.DB, target.uid, target.role);
        return jsonResponse(corsHeaders, {
          success: true,
          user: target,
          effectiveScopes,
          entitlements: entitlements || [],
        });
      }

      const { results: users } = await env.DB
        .prepare('SELECT uid, username, email, role, status, must_change_password, created_at FROM users ORDER BY created_at DESC LIMIT 100')
        .all();
      const { results: allEntitlements } = await env.DB
        .prepare('SELECT uid, scope, expires_at, granted_by, created_at FROM user_entitlements')
        .all();

      return jsonResponse(corsHeaders, {
        success: true,
        availableScopes: ALL_SCOPES,
        users: users || [],
        entitlements: allEntitlements || [],
      });
    }

    // 2. POST /api/admin/entitlements - 为用户授予或续期 scope
    if (path === '/api/admin/entitlements' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const target = await lookupTargetUser(env.DB, body.uid, body.username);
      if (!target) {
        return jsonResponse(corsHeaders, { error: '目标用户不存在，请确认 uid 或 username' }, 404);
      }

      const scope = String(body.scope || '').trim();
      if (!validateScopeFormat(scope)) {
        return jsonResponse(corsHeaders, { error: '无效的 scope 格式，应类似 netbom:cost_view' }, 400);
      }

      let expiresAt = null;
      if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
        expiresAt = Number(body.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
          return jsonResponse(corsHeaders, { error: '无效的 expiresAt 时间戳' }, 400);
        }
      } else if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
        const days = Number(body.expiresInDays);
        if (!Number.isFinite(days) || days <= 0) {
          return jsonResponse(corsHeaders, { error: '无效的 expiresInDays 天数' }, 400);
        }
        expiresAt = Date.now() + Math.floor(days * 24 * 3600 * 1000);
      }

      const now = Date.now();
      await env.DB
        .prepare(
          `INSERT INTO user_entitlements (uid, scope, expires_at, granted_by, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(uid, scope) DO UPDATE SET
             expires_at = excluded.expires_at,
             granted_by = excluded.granted_by,
             created_at = excluded.created_at`
        )
        .bind(target.uid, scope, expiresAt, admin.username, now)
        .run();

      await invalidateUserSessionsCache(env, target.uid);
      const effectiveScopes = await resolveUserScopes(env.DB, target.uid, target.role);

      return jsonResponse(corsHeaders, {
        success: true,
        uid: target.uid,
        username: target.username,
        scope,
        expiresAt,
        effectiveScopes,
        message: `已为用户 ${target.username} 授予权限 ${scope}`,
      });
    }

    // 3. DELETE /api/admin/entitlements - 回收用户指定 scope
    if (path === '/api/admin/entitlements' && request.method === 'DELETE') {
      let body = {};
      if (request.headers.get('Content-Type')?.includes('application/json')) {
        body = await request.json().catch(() => ({}));
      }
      const uid = body.uid || url.searchParams.get('uid');
      const username = body.username || url.searchParams.get('username');
      const scope = String(body.scope || url.searchParams.get('scope') || '').trim();

      const target = await lookupTargetUser(env.DB, uid, username);
      if (!target) {
        return jsonResponse(corsHeaders, { error: '目标用户不存在' }, 404);
      }
      if (!scope) {
        return jsonResponse(corsHeaders, { error: '请指定要回收的 scope' }, 400);
      }

      await env.DB
        .prepare('DELETE FROM user_entitlements WHERE uid = ? AND scope = ?')
        .bind(target.uid, scope)
        .run();

      await invalidateUserSessionsCache(env, target.uid);
      const effectiveScopes = await resolveUserScopes(env.DB, target.uid, target.role);

      return jsonResponse(corsHeaders, {
        success: true,
        uid: target.uid,
        username: target.username,
        removedScope: scope,
        effectiveScopes,
        message: `已回收 ${target.username} 的权限 ${scope}`,
      });
    }

    // 4. POST /api/admin/reset-password - 管理员代重置用户密码并全端踢下线
    if (path === '/api/admin/reset-password' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const target = await lookupTargetUser(env.DB, body.uid, body.username);
      if (!target) {
        return jsonResponse(corsHeaders, { error: '目标用户不存在' }, 404);
      }

      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 6) {
        return jsonResponse(corsHeaders, { error: '新密码长度至少需为 6 位' }, 400);
      }

      const salt = crypto.randomUUID().slice(0, 8);
      const hash = await hashSaltedPassword(newPassword, salt);
      const mustChange = body.mustChangePassword ? 1 : 0;

      await env.DB
        .prepare('UPDATE users SET password_hash = ?, salt = ?, must_change_password = ?, updated_at = ? WHERE uid = ?')
        .bind(hash, salt, mustChange, Date.now(), target.uid)
        .run();

      await revokeUserSessions(env, target.uid);

      return jsonResponse(corsHeaders, {
        success: true,
        uid: target.uid,
        username: target.username,
        message: `已重置用户 ${target.username} 的密码并吊销其全部历史会话`,
      });
    }

    // 5. POST /api/admin/migrate-kv-to-d1 - 幂等将存量 KV 数据迁移至 D1
    if (path === '/api/admin/migrate-kv-to-d1' && request.method === 'POST') {
      if (!env.TEACHER_KV) {
        return jsonResponse(corsHeaders, { error: 'TEACHER_KV 未绑定，无法执行迁移' }, 503);
      }
      const report = await migrateKvToD1(env, admin.username);
      return jsonResponse(corsHeaders, {
        success: true,
        report,
        message: 'KV 到 D1 数据幂等迁移已完成',
      });
    }

    return jsonResponse(corsHeaders, { error: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: 'Admin API Error: ' + err.message }, 500);
  }
}

async function listAllKvKeysByPrefix(kv, prefix) {
  const keys = [];
  let cursor = undefined;
  do {
    const res = await kv.list({ prefix, cursor });
    for (const k of res.keys || []) {
      keys.push(k.name);
    }
    cursor = res.list_complete ? undefined : res.cursor;
  } while (cursor);
  return keys;
}

async function grantEntitlementIdempotent(db, uid, scope, grantedBy) {
  const res = await db
    .prepare(
      `INSERT INTO user_entitlements (uid, scope, expires_at, granted_by, created_at)
       VALUES (?, ?, NULL, ?, ?)
       ON CONFLICT(uid, scope) DO NOTHING`
    )
    .bind(uid, scope, grantedBy, Date.now())
    .run();
  return (res.meta && res.meta.changes) || 0;
}

async function upsertKvAuthUserToD1(db, rec, actorUsername) {
  if (!rec || !rec.username) return { userInserted: false, adminGranted: false };
  const now = Date.now();
  const cleanUser = String(rec.username).trim().toLowerCase();
  const cleanEmail = rec.email ? String(rec.email).trim().toLowerCase() : null;
  const uid = String(rec.uid || ('u_' + cleanUser));
  const role = rec.role === 'admin' ? 'admin' : 'user';
  const createdAt = Number(rec.createdAt) || now;
  const updatedAt = Number(rec.lastLoginAt) || createdAt;

  const insertRes = await db
    .prepare(
      `INSERT INTO users (uid, username, email, password_hash, salt, role, status, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)
       ON CONFLICT(username) DO NOTHING`
    )
    .bind(uid, cleanUser, cleanEmail, String(rec.hash || ''), String(rec.salt || ''), role, createdAt, updatedAt)
    .run();

  const userInserted = Boolean(insertRes.meta && insertRes.meta.changes > 0);
  let adminGranted = false;

  const row = await db.prepare('SELECT uid, role FROM users WHERE username = ?').bind(cleanUser).first();
  if (row && row.role === 'admin') {
    for (const scope of ALL_SCOPES) {
      const changes = await grantEntitlementIdempotent(db, row.uid, scope, actorUsername);
      if (changes > 0) adminGranted = true;
    }
  }
  return { userInserted, adminGranted };
}

async function migrateKvToD1(env, actorUsername) {
  const db = env.DB;
  const kv = env.TEACHER_KV;
  const now = Date.now();
  const report = {
    usersMigrated: 0,
    adminsGranted: 0,
    bomProjectsMigrated: 0,
    teacherAccountsCreated: 0,
    teacherEntitlementsGranted: 0,
    teacherWorkspacesMigrated: 0,
  };

  // Step 1: auth:user:* -> users (+ full scopes for admins)
  const authKeys = await listAllKvKeysByPrefix(kv, 'auth:user:');
  for (const key of authKeys) {
    const rec = await kv.get(key, 'json');
    const res = await upsertKvAuthUserToD1(db, rec, actorUsername);
    if (res.userInserted) report.usersMigrated++;
    if (res.adminGranted) report.adminsGranted++;
  }

  // Step 2: bom:user:*:projects -> bom_projects
  const bomKeys = await listAllKvKeysByPrefix(kv, 'bom:user:');
  for (const key of bomKeys) {
    const match = key.match(/^bom:user:([^:]+):projects$/);
    if (!match) continue;
    const uid = match[1];
    const projects = await kv.get(key, 'json');
    if (!Array.isArray(projects)) continue;

    for (const proj of projects) {
      if (!proj || !proj.id || !proj.name || !proj.payload) continue;
      const createdAt = Number(proj.createdAt) || now;
      const updatedAt = Number(proj.updatedAt) || createdAt;
      const res = await db
        .prepare(
          `INSERT INTO bom_projects (id, uid, name, description, summary_json, data_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`
        )
        .bind(
          String(proj.id),
          uid,
          String(proj.name),
          String(proj.description || ''),
          JSON.stringify(proj.summary || {}),
          JSON.stringify(proj.payload),
          createdAt,
          updatedAt
        )
        .run();
      if (res.meta && res.meta.changes > 0) {
        report.bomProjectsMigrated++;
      }
    }
  }

  // Step 3: teacher:user:* -> users (if missing, create with must_change_password = 1) + app:teacher entitlement
  const teacherUserKeys = await listAllKvKeysByPrefix(kv, 'teacher:user:');
  for (const key of teacherUserKeys) {
    const rec = await kv.get(key, 'json');
    const cleanUser = String((rec && rec.username) || key.slice('teacher:user:'.length)).trim().toLowerCase();
    if (!cleanUser) continue;

    let userRow = await db.prepare('SELECT uid, role FROM users WHERE username = ?').bind(cleanUser).first();
    if (!userRow) {
      const uid = 'u_tw_' + cleanUser;
      const createdAt = Number(rec && rec.createdAt) || now;
      const updatedAt = Number(rec && rec.lastLoginAt) || createdAt;
      await db
        .prepare(
          `INSERT INTO users (uid, username, email, password_hash, salt, role, status, must_change_password, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 'legacy_sha256', 'user', 'active', 1, ?, ?)
           ON CONFLICT(username) DO NOTHING`
        )
        .bind(uid, cleanUser, String((rec && rec.passwordHash) || ''), createdAt, updatedAt)
        .run();
      userRow = await db.prepare('SELECT uid, role FROM users WHERE username = ?').bind(cleanUser).first();
      if (userRow) report.teacherAccountsCreated++;
    }

    if (userRow) {
      const changes = await grantEntitlementIdempotent(db, userRow.uid, 'app:teacher', actorUsername);
      if (changes > 0) report.teacherEntitlementsGranted++;
    }
  }

  // Step 4: teacher:data:* -> teacher_workspaces
  const teacherDataKeys = await listAllKvKeysByPrefix(kv, 'teacher:data:');
  for (const key of teacherDataKeys) {
    const cleanUser = key.slice('teacher:data:'.length).trim().toLowerCase();
    if (!cleanUser) continue;
    const stored = await kv.get(key, 'json');
    if (!stored) continue;

    let userRow = await db.prepare('SELECT uid FROM users WHERE username = ?').bind(cleanUser).first();
    if (!userRow) {
      const uid = 'u_tw_' + cleanUser;
      await db
        .prepare(
          `INSERT INTO users (uid, username, email, password_hash, salt, role, status, must_change_password, created_at, updated_at)
           VALUES (?, ?, NULL, '', 'legacy_sha256', 'user', 'active', 1, ?, ?)
           ON CONFLICT(username) DO NOTHING`
        )
        .bind(uid, cleanUser, now, now)
        .run();
      userRow = await db.prepare('SELECT uid FROM users WHERE username = ?').bind(cleanUser).first();
      if (userRow) {
        report.teacherAccountsCreated++;
        const changes = await grantEntitlementIdempotent(db, userRow.uid, 'app:teacher', actorUsername);
        if (changes > 0) report.teacherEntitlementsGranted++;
      }
    }

    if (!userRow) continue;
    const updatedAt = Number(stored.serverUpdatedAt || stored.clientUpdatedAt) || now;
    const res = await db
      .prepare(
        `INSERT INTO teacher_workspaces (uid, data_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(uid) DO UPDATE SET
           data_json = excluded.data_json,
           updated_at = excluded.updated_at
         WHERE excluded.updated_at > teacher_workspaces.updated_at`
      )
      .bind(userRow.uid, JSON.stringify(stored), updatedAt)
      .run();
    if (res.meta && res.meta.changes > 0) {
      report.teacherWorkspacesMigrated++;
    }
  }

  return report;
}

// ==========================================
// 📦 NETBOM API (/api/bom/* -> D1 Projects + KV Global/Codes)
// ==========================================

function formatBomProjectRow(row, includePayload = true) {
  let summary = {};
  try {
    summary = row.summary_json ? JSON.parse(row.summary_json) : {};
  } catch (e) {}

  const base = {
    id: row.id,
    name: row.name,
    description: row.description || '',
    summary,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };

  if (includePayload) {
    let payload = null;
    try {
      payload = row.data_json ? JSON.parse(row.data_json) : null;
    } catch (e) {}
    base.payload = payload;
  }
  return base;
}

async function handleBomApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const corsHeaders = getAuthCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const hasDB = !!(env && env.DB);
  const hasKV = !!(env && env.TEACHER_KV);

  try {
    // 1. 个人云端工程管理 (D1 bom_projects 独立行存储)
    if (path === '/api/bom/projects') {
      const user = await authenticateRequest(request, env);
      if (!user) {
        return jsonResponse(corsHeaders, { error: '请先登录以访问个人云端报价工程', needAuth: true }, 401);
      }
      if (!hasDB) {
        return jsonResponse(corsHeaders, { error: 'D1 云端数据库未绑定' }, 503);
      }

      if (request.method === 'GET') {
        const targetId = url.searchParams.get('id');
        const isSummaryOnly = url.searchParams.get('summary') === '1';

        if (targetId) {
          const row = await env.DB
            .prepare('SELECT id, uid, name, description, summary_json, data_json, created_at, updated_at FROM bom_projects WHERE id = ? AND uid = ?')
            .bind(targetId, user.uid)
            .first();
          if (!row) {
            return jsonResponse(corsHeaders, { error: '未找到指定工程' }, 404);
          }
          return jsonResponse(corsHeaders, {
            success: true,
            project: formatBomProjectRow(row, true),
            serverTime: Date.now(),
          });
        }

        const selectCols = isSummaryOnly
          ? 'id, name, description, summary_json, created_at, updated_at'
          : 'id, name, description, summary_json, data_json, created_at, updated_at';

        const { results } = await env.DB
          .prepare(`SELECT ${selectCols} FROM bom_projects WHERE uid = ? ORDER BY updated_at DESC LIMIT ?`)
          .bind(user.uid, MAX_BOM_PROJECTS)
          .all();

        const projects = (results || []).map((row) => formatBomProjectRow(row, !isSummaryOnly));
        return jsonResponse(corsHeaders, {
          success: true,
          username: user.username,
          projects,
          serverTime: Date.now(),
        });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const cleanName = String(body.name || '').trim();
        if (!cleanName) {
          return jsonResponse(corsHeaders, { error: '工程名称不能为空' }, 400);
        }
        if (!body.payload) {
          return jsonResponse(corsHeaders, { error: 'BOM 数据载荷不能为空' }, 400);
        }

        const now = Date.now();
        const desc = String(body.description || '');
        const summaryJson = JSON.stringify(body.summary || {});
        const dataJson = JSON.stringify(body.payload);

        if (body.id) {
          const existing = await env.DB
            .prepare('SELECT id, created_at FROM bom_projects WHERE id = ? AND uid = ?')
            .bind(String(body.id), user.uid)
            .first();
          if (existing) {
            await env.DB
              .prepare(
                `UPDATE bom_projects
                 SET name = ?, description = ?, summary_json = ?, data_json = ?, updated_at = ?
                 WHERE id = ? AND uid = ?`
              )
              .bind(cleanName, desc, summaryJson, dataJson, now, existing.id, user.uid)
              .run();

            return jsonResponse(corsHeaders, {
              success: true,
              project: {
                id: existing.id,
                name: cleanName,
                description: desc,
                summary: body.summary || {},
                payload: body.payload,
                createdAt: Number(existing.created_at),
                updatedAt: now,
              },
              message: '个人工程已成功同步至云端',
            });
          }
        }

        const newId = 'proj_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        await env.DB
          .prepare(
            `INSERT INTO bom_projects (id, uid, name, description, summary_json, data_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(newId, user.uid, cleanName, desc, summaryJson, dataJson, now, now)
          .run();

        return jsonResponse(corsHeaders, {
          success: true,
          project: {
            id: newId,
            name: cleanName,
            description: desc,
            summary: body.summary || {},
            payload: body.payload,
            createdAt: now,
            updatedAt: now,
          },
          message: '个人工程已成功同步至云端',
        });
      }

      if (request.method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) {
          return jsonResponse(corsHeaders, { error: '请指定要删除的工程 ID' }, 400);
        }
        await env.DB.prepare('DELETE FROM bom_projects WHERE id = ? AND uid = ?').bind(id, user.uid).run();
        return jsonResponse(corsHeaders, {
          success: true,
          id,
          message: '工程已删除',
        });
      }
    }

    // 1.1 批量导入恢复工程备份
    if (path === '/api/bom/projects/import' && request.method === 'POST') {
      const user = await authenticateRequest(request, env);
      if (!user) {
        return jsonResponse(corsHeaders, { error: '请先登录以导入个人工程', needAuth: true }, 401);
      }
      if (!hasDB) {
        return jsonResponse(corsHeaders, { error: 'D1 云端数据库未绑定' }, 503);
      }

      const body = await request.json().catch(() => ({}));
      const incomingList = Array.isArray(body.projects) ? body.projects : [];
      if (incomingList.length === 0) {
        return jsonResponse(corsHeaders, { error: '导入数据中未包含有效工程列表' }, 400);
      }

      const now = Date.now();
      let addedCount = 0;
      for (const item of incomingList) {
        if (!item || !item.name || !item.payload) continue;
        const projId = item.id ? String(item.id) : ('proj_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6));
        const createdAt = Number(item.createdAt) || now;
        const updatedAt = Number(item.updatedAt) || now;
        const res = await env.DB
          .prepare(
            `INSERT INTO bom_projects (id, uid, name, description, summary_json, data_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`
          )
          .bind(
            projId,
            user.uid,
            String(item.name),
            String(item.description || ''),
            JSON.stringify(item.summary || {}),
            JSON.stringify(item.payload),
            createdAt,
            updatedAt
          )
          .run();
        if (res.meta && res.meta.changes > 0) addedCount++;
      }

      const { results } = await env.DB
        .prepare('SELECT id, name, description, summary_json, data_json, created_at, updated_at FROM bom_projects WHERE uid = ? ORDER BY updated_at DESC LIMIT ?')
        .bind(user.uid, MAX_BOM_PROJECTS)
        .all();
      const currentProjects = (results || []).map((row) => formatBomProjectRow(row, true));

      return jsonResponse(corsHeaders, {
        success: true,
        importedCount: addedCount,
        totalCount: currentProjects.length,
        projects: currentProjects,
        message: `成功恢复 ${addedCount} 个工程备份！`,
      });
    }

    // 2. 全网官方默认配置 (GET 公开 / POST 需 Admin 或 netbom:publish 权限)
    if (path === '/api/bom/default' && request.method === 'GET') {
      if (!hasKV) {
        return jsonResponse(corsHeaders, { success: false, error: 'KV服务未就绪' }, 503);
      }
      const defaultRecord = await env.TEACHER_KV.get('bom:global:default', 'json');
      return jsonResponse(corsHeaders, {
        success: true,
        record: defaultRecord || null,
        serverTime: Date.now(),
      });
    }

    if (path === '/api/bom/publish-default' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const user = await authenticateRequest(request, env);
      const hasPublishPerm = requireScope(user, 'netbom:publish');
      const adminInitKey = getAdminInitKey(env);
      const isValidAdminKey = !!(adminInitKey && body.adminKey && String(body.adminKey).trim() === adminInitKey);

      if (!hasPublishPerm && !isValidAdminKey) {
        return jsonResponse(corsHeaders, { error: '权限不足：需要管理员或 netbom:publish 权限' }, 403);
      }
      if (!body.payload) {
        return jsonResponse(corsHeaders, { error: '发布数据不能为空' }, 400);
      }
      if (!hasKV) {
        return jsonResponse(corsHeaders, { error: 'KV 服务未就绪' }, 503);
      }

      const existing = await env.TEACHER_KV.get('bom:global:default', 'json');
      const version = (existing && existing.version ? existing.version : 0) + 1;

      const record = {
        payload: body.payload,
        version,
        updatedAt: Date.now(),
        publishedBy: user ? user.username : 'admin',
      };
      await env.TEACHER_KV.put('bom:global:default', JSON.stringify(record));

      return jsonResponse(corsHeaders, {
        success: true,
        version,
        updatedAt: record.updatedAt,
        serverTime: Date.now(),
        message: '已成功发布为全网默认！全球所有访问者将直接看到此版本。',
      });
    }

    // 3. 项目码分享 (保留 KV 短码分享)
    if (path === '/api/bom/sync') {
      if (!hasKV) {
        return jsonResponse(corsHeaders, { error: 'KV 服务未就绪' }, 503);
      }

      if (request.method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase();
        const pass = (url.searchParams.get('pass') || '').trim();
        if (!code) {
          return jsonResponse(corsHeaders, { error: '请提供项目同步码' }, 400);
        }

        const record = await env.TEACHER_KV.get(`bom:code:${code}`, 'json');
        if (!record) {
          return jsonResponse(corsHeaders, { error: '未找到该同步码对应的云端报价记录' }, 404);
        }
        if (record.passHash && record.passHash !== pass) {
          return jsonResponse(corsHeaders, { error: '访问口令不正确', needPass: true }, 401);
        }

        return jsonResponse(corsHeaders, {
          success: true,
          code,
          payload: record.payload,
          updatedAt: record.updatedAt,
          serverTime: Date.now(),
        });
      }

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const cleanCode = String(body.code || '').trim().toUpperCase();
        if (!cleanCode || cleanCode.length < 3) {
          return jsonResponse(corsHeaders, { error: '同步码至少需要3位字符' }, 400);
        }
        if (!body.payload) {
          return jsonResponse(corsHeaders, { error: '数据载荷不能为空' }, 400);
        }

        const dataKey = `bom:code:${cleanCode}`;
        const existing = await env.TEACHER_KV.get(dataKey, 'json');
        if (existing && existing.passHash && existing.passHash !== (body.pass || '')) {
          return jsonResponse(corsHeaders, { error: '该同步码已被口令保护，请输入正确口令' }, 401);
        }

        const record = {
          code: cleanCode,
          passHash: body.pass ? String(body.pass).trim() : (existing ? existing.passHash : ''),
          payload: body.payload,
          updatedAt: Date.now(),
        };
        await env.TEACHER_KV.put(dataKey, JSON.stringify(record));

        return jsonResponse(corsHeaders, {
          success: true,
          code: cleanCode,
          updatedAt: record.updatedAt,
          serverTime: Date.now(),
          message: '保存成功',
        });
      }
    }

    return jsonResponse(corsHeaders, { error: 'Not Found' }, 404);
  } catch (err) {
    return jsonResponse(corsHeaders, { error: 'Server Error: ' + err.message }, 500);
  }
}
