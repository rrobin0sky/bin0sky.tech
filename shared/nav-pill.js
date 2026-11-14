/**
 * bin0sky Global Nav Pill Component (Apple Glassmorphism Edition)
 * A zero-dependency, self-contained glass floating navigation pill for standalone pages.
 * Automatically syncs theme (b0_theme) and language (b0_lang) across all bin0sky tools.
 * In embedded mode (inside BinOS Workstation), automatically hides redundant buttons and stays transparent.
 */
(function() {
  if (window.__b0_nav_pill_loaded) return;
  window.__b0_nav_pill_loaded = true;

  // Root Domain Cookie Helper (.bin0sky.tech) for cross-subdomain sharing
  function setRootDomainCookie(name, value) {
    try {
      const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
      const domainStr = isLocal ? '' : '; domain=.bin0sky.tech';
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/${domainStr}; max-age=31536000; SameSite=Lax`;
    } catch(e) {}
  }

  function getCookie(name) {
    try {
      const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[2]) : null;
    } catch(e) { return null; }
  }

  function normalizeLang(lang) {
    if (!lang) return 'zh-CN';
    const l = lang.toLowerCase();
    return l.startsWith('zh') ? 'zh-CN' : 'en';
  }

  // Universal Theme Sync Engine
  function applyTheme() {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    if (document.body) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#08090A');

    try {
      localStorage.setItem('b0_theme', 'dark');
    } catch(e) {}
    setRootDomainCookie('b0_theme', 'dark');

    // Dispatch event so host pages (charts, canvases, tables, sub-apps) update immediately
    try {
      const evt = new CustomEvent('b0-theme-change', { detail: { theme: 'dark', isDark: true } });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    } catch(e) {}
  }

  // Universal Language Sync Engine (Simplified: zh-CN & en only)
  function applyLang(lang) {
    if (!lang) return;
    const normalized = normalizeLang(lang);
    const shortLang = normalized.startsWith('zh') ? 'zh' : 'en';
    document.documentElement.setAttribute('lang', shortLang);
    try {
      localStorage.setItem('b0_lang', normalized);
      localStorage.setItem('archicons_lang', shortLang);
    } catch(e) {}
    setRootDomainCookie('b0_lang', normalized);

    try {
      const evt = new CustomEvent('b0-lang-change', {
        detail: {
          lang: shortLang,
          fullLang: normalized
        }
      });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    } catch(e) {}
  }

  // Read URL search params (highest priority in iframe/embedded contexts)
  let paramTheme = null;
  let paramLang = null;
  let paramEmbedded = false;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    paramTheme = urlParams.get('b0_theme');
    paramLang = urlParams.get('b0_lang');
    paramEmbedded = (urlParams.get('b0_embedded') === '1');
  } catch(e) {}

  // Dark-only theme enforcement
  const initialDark = true;
  applyTheme(true);

  let savedLang = paramLang;
  if (!savedLang) {
    try {
      savedLang = localStorage.getItem('b0_lang') || getCookie('b0_lang');
    } catch(e) {}
  }
  if (savedLang) {
    applyLang(savedLang);
  }

  // Inject Global Utility CSS (hides duplicate buttons inside workstation iframe)
  const utilityStyle = document.createElement('style');
  utilityStyle.id = 'b0-utility-style';
  utilityStyle.textContent = `
    html.b0-embedded .b0-hide-in-frame,
    html.b0-embedded [data-b0-hide-in-frame] {
      display: none !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(utilityStyle);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (!document.getElementById('b0-utility-style')) {
        document.head.appendChild(utilityStyle);
      }
    });
  }

  // Trusted origin check for BinOS cross-window postMessage bridge
  function isTrustedOrigin(origin) {
    if (!origin) return false;
    if (origin === window.location.origin) return true;
    if (origin === 'https://bin0sky.tech') return true;
    if (/^https:\/\/[a-z0-9-]+\.bin0sky\.tech$/i.test(origin)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
    return false;
  }

  function getParentTargetOrigin() {
    if (document.referrer) {
      try {
        const refOrigin = new URL(document.referrer).origin;
        if (isTrustedOrigin(refOrigin)) return refOrigin;
      } catch (e) {}
    }
    if (/(^|\.)bin0sky\.tech$/i.test(window.location.hostname)) {
      return 'https://bin0sky.tech';
    }
    return '*';
  }

  function postToParent(type, payload) {
    if (!type || typeof type !== 'string') return false;
    if (!window.parent || window.parent === window) return false;
    try {
      const msg = Object.assign({}, payload && typeof payload === 'object' ? payload : {}, { type: type });
      window.parent.postMessage(msg, getParentTargetOrigin());
      return true;
    } catch (e) {
      return false;
    }
  }

  function showStandaloneToast(message, options) {
    if (!message) return;
    const opts = options && typeof options === 'object' ? options : {};
    const duration = Number(opts.duration) > 0 ? Number(opts.duration) : 2400;
    let toast = document.getElementById('b0-standalone-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'b0-standalone-toast';
      toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;padding:8px 14px;border-radius:12px;backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);background:rgba(24,24,27,0.82);border:1px solid rgba(255,255,255,0.14);color:#f8fafc;font-size:12px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,0.32);transition:all 0.22s cubic-bezier(0.16,1,0.3,1);opacity:0;transform:translateY(-8px);pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = String(message);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    clearTimeout(window.__b0_standalone_toast_timer);
    window.__b0_standalone_toast_timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
    }, duration);
  }

  const isBin0skyDomain = /(^|\.)bin0sky\.tech$/i.test(window.location.hostname);
  const authBaseUrl = isBin0skyDomain ? 'https://bin0sky.tech' : '';

  // Check if running inside iframe (BinOS Workstation Stage)
  const isEmbedded = (paramEmbedded || window.top !== window.self);

  // Lightweight Cross-Window Communication Bridge (available in both embedded and standalone modes)
  window.B0Bridge = {
    isEmbedded: isEmbedded,
    postMessage: postToParent,
    requireAuth: function(options) {
      const opts = typeof options === 'string' ? { reason: options } : (options && typeof options === 'object' ? options : {});
      if (postToParent('B0_AUTH_REQUIRED', {
        reason: opts.reason || '',
        needScope: opts.needScope || '',
        mode: opts.mode || 'login',
      })) {
        return true;
      }
      window.location.href = `${authBaseUrl}/#login?redirect_uri=${encodeURIComponent(window.location.href)}`;
      return false;
    },
    syncRoute: function(routeOrOptions) {
      const opts = typeof routeOrOptions === 'string'
        ? { route: routeOrOptions }
        : (routeOrOptions && typeof routeOrOptions === 'object' ? routeOrOptions : {});
      return postToParent('B0_ROUTE_SYNC', {
        route: opts.route || '',
        path: opts.path || '',
        hash: opts.hash || '',
        query: opts.query || '',
        title: opts.title || '',
      });
    },
    toast: function(message, options) {
      const opts = options && typeof options === 'object' ? options : {};
      if (postToParent('B0_TOAST', {
        message: String(message || ''),
        variant: opts.variant || 'info',
        duration: opts.duration,
      })) {
        return true;
      }
      showStandaloneToast(message, opts);
      return false;
    }
  };

  // Listen for parent theme & lang bridge in both embedded and top windows
  window.addEventListener('message', function(e) {
    if (!e.data || !isTrustedOrigin(e.origin)) return;
    if (e.data.type === 'B0_THEME_CHANGE') {
      applyTheme(true);
    } else if (e.data.type === 'B0_LANG_CHANGE') {
      applyLang(e.data.lang);
    }
  });

  // Listen for storage changes across tabs
  window.addEventListener('storage', function(e) {
    if (e.key === 'b0_theme' && e.newValue) {
      applyTheme(true);
    } else if (e.key === 'b0_lang' && e.newValue) {
      applyLang(e.newValue);
    }
  });

  if (isEmbedded) {
    document.documentElement.classList.add('b0-embedded');
    // Request current theme and language from parent workstation shell
    postToParent('B0_REQUEST_THEME');
    postToParent('B0_REQUEST_LANG');
    // If embedded, parent workstation shell handles chrome, controls, and pills
    return;
  }

  // Read config from script tag attributes
  const currentScript = document.currentScript || document.querySelector('script[src*="nav-pill.js"]');
  const title = (currentScript && currentScript.getAttribute('data-title')) || document.title.split('·')[0].split('—')[0].trim() || 'Insight';
  const category = (currentScript && currentScript.getAttribute('data-category')) || 'notes';

  const categoryLabels = {
    'notes': { icon: '📑', label: 'NOTES', color: '#f43f5e' },
    'apps': { icon: '🚀', label: 'APPS', color: '#0ea5e9' },
    'labs': { icon: '🧪', label: 'LABS', color: '#10b981' }
  };
  const catInfo = categoryLabels[category] || categoryLabels['notes'];

  // Inject Styles (Linear Cool Dark Tech Aesthetic)
  const style = document.createElement('style');
  style.textContent = `
    #b0-nav-pill-host {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      font-family: 'Inter', 'Geist', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      font-size: 12px;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #b0-nav-pill-host * { box-sizing: border-box; }
    
    /* Dark-First Linear Defaults */
    .b0-pill-bar {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 5px 10px 5px 6px;
      border-radius: 9999px;
      background: rgba(8, 9, 10, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #F7F8F8;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-pill-bar:hover {
      border-color: rgba(255, 255, 255, 0.16);
      background: rgba(17, 18, 20, 0.85);
    }
    .b0-pill-home {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: #F7F8F8;
      font-weight: 600;
      padding: 4px 10px 4px 6px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-pill-home:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.16);
    }
    .b0-pill-logo {
      width: 18px;
      height: 18px;
      border-radius: 6px;
      background: #5E6AD2;
      color: #FFFFFF;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 700;
    }
    .b0-pill-sep {
      width: 1px;
      height: 12px;
      background: rgba(255, 255, 255, 0.08);
    }
    .b0-pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 600;
      color: #8A8F98;
      text-transform: uppercase;
    }
    .b0-pill-title {
      font-weight: 500;
      color: #D0D6E0;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    @media (max-width: 640px) {
      .b0-pill-title { display: none; }
    }
    .b0-pill-btn {
      background: transparent;
      border: none;
      color: #8A8F98;
      cursor: pointer;
      padding: 5px 6px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-pill-btn:hover {
      color: #F7F8F8;
      background: rgba(255, 255, 255, 0.06);
    }
    .b0-menu-panel {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: 280px;
      border-radius: 12px;
      background: rgba(17, 18, 20, 0.96);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 2px;
    }
    .b0-menu-panel.open { display: flex; }
    .b0-menu-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 8px;
      text-decoration: none;
      color: #D0D6E0;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-menu-item:hover {
      background: #18191C;
      color: #F7F8F8;
    }
    .b0-menu-item-left {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .b0-menu-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 600;
    }
    .b0-menu-name { font-weight: 600; font-size: 12px; letter-spacing: -0.01em; }
    .b0-menu-desc { font-size: 10px; color: #8A8F98; margin-top: 2px; }

    /* SSO Auth Pill Slot */
    .b0-pill-auth {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .b0-pill-user {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #E2E8F0;
      max-width: 110px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .b0-pill-role {
      font-size: 9px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 9999px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .b0-pill-role.admin {
      background: rgba(245, 158, 11, 0.16);
      color: #FBBF24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .b0-pill-role.pro {
      background: rgba(16, 185, 129, 0.16);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .b0-pill-role.member {
      background: rgba(94, 106, 210, 0.18);
      color: #A5B4FC;
      border: 1px solid rgba(94, 106, 210, 0.3);
    }
    .b0-pill-login-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      border-radius: 9999px;
      background: rgba(94, 106, 210, 0.22);
      border: 1px solid rgba(94, 106, 210, 0.42);
      color: #C7D2FE;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-pill-login-btn:hover {
      background: rgba(94, 106, 210, 0.36);
      color: #FFFFFF;
    }

    /* Light Mode Overrides */
    html:not(.dark) .b0-pill-bar,
    html.light .b0-pill-bar {
      background: rgba(248, 250, 252, 0.88);
      border: 1px solid rgba(15, 23, 42, 0.10);
      color: #0F172A;
    }
    html:not(.dark) .b0-pill-bar:hover,
    html.light .b0-pill-bar:hover {
      border-color: rgba(15, 23, 42, 0.18);
    }
    html:not(.dark) .b0-pill-home,
    html.light .b0-pill-home {
      color: #0F172A;
      background: rgba(15, 23, 42, 0.04);
      border-color: rgba(15, 23, 42, 0.08);
    }
    html:not(.dark) .b0-pill-home:hover,
    html.light .b0-pill-home:hover {
      background: rgba(15, 23, 42, 0.08);
    }
    html:not(.dark) .b0-pill-logo,
    html.light .b0-pill-logo {
      background: #5E6AD2;
      color: #FFFFFF;
    }
    html:not(.dark) .b0-pill-sep,
    html.light .b0-pill-sep {
      background: rgba(15, 23, 42, 0.10);
    }
    html:not(.dark) .b0-pill-badge,
    html.light .b0-pill-badge {
      color: #64748B;
    }
    html:not(.dark) .b0-pill-title,
    html.light .b0-pill-title {
      color: #334155;
    }
    html:not(.dark) .b0-pill-btn,
    html.light .b0-pill-btn {
      color: #64748B;
    }
    html:not(.dark) .b0-pill-btn:hover,
    html.light .b0-pill-btn:hover {
      color: #0F172A;
      background: rgba(15, 23, 42, 0.06);
    }
    html:not(.dark) .b0-menu-panel,
    html.light .b0-menu-panel {
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(15, 23, 42, 0.12);
      color: #0F172A;
    }
    html:not(.dark) .b0-menu-item,
    html.light .b0-menu-item {
      color: #334155;
    }
    html:not(.dark) .b0-menu-item:hover,
    html.light .b0-menu-item:hover {
      background: #F1F5F9;
      color: #0F172A;
    }
    html:not(.dark) .b0-menu-desc,
    html.light .b0-menu-desc {
      color: #64748B;
    }
    html:not(.dark) .b0-pill-user,
    html.light .b0-pill-user {
      color: #0F172A;
    }
    html:not(.dark) .b0-pill-login-btn,
    html.light .b0-pill-login-btn {
      background: rgba(94, 106, 210, 0.12);
      color: #4338CA;
      border-color: rgba(94, 106, 210, 0.28);
    }
    html:not(.dark) .b0-pill-login-btn:hover,
    html.light .b0-pill-login-btn:hover {
      background: rgba(94, 106, 210, 0.2);
      color: #312E81;
    }
  `;
  document.head.appendChild(style);

  const isBin0skyHost = /(^|\.)bin0sky\.tech$/i.test(window.location.hostname);
  const authBase = isBin0skyHost ? 'https://bin0sky.tech' : '';

  // Build DOM
  const host = document.createElement('div');
  host.id = 'b0-nav-pill-host';
  host.innerHTML = `
    <div class="b0-pill-bar">
      <a href="${authBase}/#/${category}" class="b0-pill-home" title="返回 BinOS 工作台全景">
        <span class="b0-pill-logo">BinOS</span>
        <span>工作台</span>
      </a>
      <span class="b0-pill-sep"></span>
      <span class="b0-pill-badge">${catInfo.icon} ${catInfo.label}</span>
      <span class="b0-pill-title">${title}</span>
      <span class="b0-pill-sep"></span>
      <div id="b0-pill-auth-slot" class="b0-pill-auth"></div>
      <button id="b0-pill-menu-btn" class="b0-pill-btn" title="浏览全站应用矩阵" aria-label="Tool Switcher">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
    </div>

    <div id="b0-pill-menu" class="b0-menu-panel">
      <div style="padding: 4px 8px 6px; font-size: 9px; font-family: ui-monospace, monospace; color: #71717a; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
        bin0sky Ecosystem
      </div>
      <a href="/" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(255,255,255,0.1); color: #fff;">⚡</span>
          <div>
            <div class="b0-menu-name">工作台全景 Overview</div>
            <div class="b0-menu-desc">返回统一数字工作台总览</div>
          </div>
        </div>
      </a>
      <a href="/#/icon" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(56,189,248,0.15); color: #38bdf8;">01</span>
          <div>
            <div class="b0-menu-name">ArchIcons</div>
            <div class="b0-menu-desc">云架构 2.5D/2D 矢量图标库</div>
          </div>
        </div>
      </a>
      <a href="/#/ppt" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(245,158,11,0.15); color: #f59e0b;">02</span>
          <div>
            <div class="b0-menu-name">SlideCraft</div>
            <div class="b0-menu-desc">AI 演示文稿秒级生成工作台</div>
          </div>
        </div>
      </a>
      <a href="/#/console" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(16,185,129,0.15); color: #10b981;">03</span>
          <div>
            <div class="b0-menu-name">AIConsole</div>
            <div class="b0-menu-desc">macOS 原生智能终端客户端</div>
          </div>
        </div>
      </a>
      <a href="/#/ambient" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(168,85,247,0.15); color: #a855f7;">04</span>
          <div>
            <div class="b0-menu-name">Ambient 4K</div>
            <div class="b0-menu-desc">4K 极简声学沉浸空间</div>
          </div>
        </div>
      </a>
      <a href="/#/bom" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(14,165,233,0.15); color: #0ea5e9;">05</span>
          <div>
            <div class="b0-menu-name">NetBOM</div>
            <div class="b0-menu-desc">网络设备选型与智能物料报价工作台</div>
          </div>
        </div>
      </a>
      <a href="/notes/population_structure_1950_2100.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(244,63,94,0.15); color: #f43f5e;">06</span>
          <div>
            <div class="b0-menu-name">人口结构变迁 1950–2100</div>
            <div class="b0-menu-desc">联合国数据四国动态推演模型</div>
          </div>
        </div>
      </a>
      <a href="/notes/fund_industry_cycles_2026.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(59,130,246,0.15); color: #3b82f6;">07</span>
          <div>
            <div class="b0-menu-name">公募基金与产业周期全景</div>
            <div class="b0-menu-desc">24 赛道周期量化与估值出清模型</div>
          </div>
        </div>
      </a>
      <a href="/notes/breakdown_fund_analysis_2026.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(245,158,11,0.15); color: #f59e0b;">08</span>
          <div>
            <div class="b0-menu-name">破位基金本质透视看板</div>
            <div class="b0-menu-desc">穿透技术陷阱与常识归因系统</div>
          </div>
        </div>
      </a>
      <a href="/notes/prompt_engineering_sop.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(94,106,210,0.18); color: #818cf8;">09</span>
          <div>
            <div class="b0-menu-name">AI 提示词工程与指令库 SOP</div>
            <div class="b0-menu-desc">从底层心法到工业级指令工作台</div>
          </div>
        </div>
      </a>
      <a href="/labs/golden_goose.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(245,158,11,0.15); color: #f59e0b;">🪿</span>
          <div>
            <div class="b0-menu-name">金鹅自由实验室</div>
            <div class="b0-menu-desc">动态复利与4%永续自由沙盒</div>
          </div>
        </div>
      </a>
    </div>
  `;

  document.body.appendChild(host);

  // Toggle Menu
  const btn = document.getElementById('b0-pill-menu-btn');
  const menu = document.getElementById('b0-pill-menu');
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (!host.contains(e.target)) menu.classList.remove('open');
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') menu.classList.remove('open');
  });

  // SSO Auth Status Loader (Cross-Subdomain Credentials)
  const authSlot = document.getElementById('b0-pill-auth-slot');
  function escapeText(str) {
    return String(str || '').replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function renderPillAuth(data) {
    if (!authSlot) return;
    if (data && data.authenticated) {
      const role = data.role || 'user';
      const scopes = Array.isArray(data.scopes) ? data.scopes : [];
      let badgeLabel = 'Member';
      let badgeCls = 'member';
      if (role === 'admin') {
        badgeLabel = 'Admin';
        badgeCls = 'admin';
      } else if (scopes.length > 0) {
        badgeLabel = 'Pro';
        badgeCls = 'pro';
      }

      authSlot.innerHTML = `
        <span class="b0-pill-user" title="已登录: ${escapeText(data.username)} (${escapeText(scopes.join(', ') || role)})">
          <span>${escapeText(data.username)}</span>
          <span class="b0-pill-role ${badgeCls}">${badgeLabel}</span>
        </span>
        <button id="b0-pill-logout-btn" class="b0-pill-btn" title="退出统一账号" aria-label="Logout" style="font-size:11px;padding:3px 6px;">退出</button>
      `;
      const logoutBtn = document.getElementById('b0-pill-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async function(e) {
          e.stopPropagation();
          try {
            await fetch(`${authBase}/api/auth/logout`, {
              method: 'POST',
              credentials: 'include'
            });
          } catch (err) {}
          window.location.reload();
        });
      }
    } else {
      const loginHref = `${authBase}/#login?redirect_uri=${encodeURIComponent(window.location.href)}`;
      authSlot.innerHTML = `<a href="${loginHref}" class="b0-pill-login-btn" title="前往统一认证中心登录">登录</a>`;
    }
  }

  async function refreshPillAuth() {
    renderPillAuth(null);
    try {
      const res = await fetch(`${authBase}/api/auth/me`, { credentials: 'include' });
      const data = await res.json();
      renderPillAuth(data);
      window.__b0AuthUser = data;
      window.dispatchEvent(new CustomEvent('b0-auth-loaded', { detail: data }));
    } catch (err) {
      renderPillAuth(null);
    }
  }

  refreshPillAuth();
})();
