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
    if (l.startsWith('zh-tw') || l.startsWith('zh-hk')) return 'zh-TW';
    if (l.startsWith('zh')) return 'zh-CN';
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('en')) return 'en';
    return lang;
  }

  // Universal Theme Sync Engine
  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      if (document.body) {
        document.body.classList.add('dark');
        document.body.classList.remove('light');
      }
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      if (document.body) {
        document.body.classList.remove('dark');
        document.body.classList.add('light');
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#090a0d' : '#f8fafc');

    // Update pill icons if rendered
    const moonIcon = document.getElementById('b0-pill-moon-icon');
    const sunIcon = document.getElementById('b0-pill-sun-icon');
    if (moonIcon && sunIcon) {
      moonIcon.style.display = isDark ? 'block' : 'none';
      sunIcon.style.display = isDark ? 'none' : 'block';
    }

    try {
      localStorage.setItem('b0_theme', isDark ? 'dark' : 'light');
    } catch(e) {}
    setRootDomainCookie('b0_theme', isDark ? 'dark' : 'light');

    // Dispatch event so host pages (charts, canvases, tables, sub-apps) update immediately
    try {
      const evt = new CustomEvent('b0-theme-change', { detail: { theme: isDark ? 'dark' : 'light', isDark: isDark } });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    } catch(e) {}
  }

  // Universal Language Sync Engine
  function applyLang(lang) {
    if (!lang) return;
    document.documentElement.setAttribute('lang', lang);
    try {
      localStorage.setItem('b0_lang', lang);
    } catch(e) {}
    setRootDomainCookie('b0_lang', lang);

    try {
      const evt = new CustomEvent('b0-lang-change', {
        detail: {
          lang: lang,
          normalizedLang: normalizeLang(lang)
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

  // Read saved theme & lang from URL params, localStorage, or root cookies
  let savedTheme = (paramTheme === 'dark' || paramTheme === 'light') ? paramTheme : null;
  if (!savedTheme) {
    try {
      savedTheme = localStorage.getItem('b0_theme') || getCookie('b0_theme');
    } catch(e) {}
  }
  const initialDark = savedTheme ? (savedTheme === 'dark') : true;
  applyTheme(initialDark);

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

  // Listen for parent theme & lang bridge in both embedded and top windows
  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'B0_THEME_CHANGE') {
      applyTheme(e.data.theme === 'dark');
    } else if (e.data.type === 'B0_LANG_CHANGE') {
      applyLang(e.data.lang);
    }
  });

  // Listen for storage changes across tabs
  window.addEventListener('storage', function(e) {
    if (e.key === 'b0_theme' && e.newValue) {
      applyTheme(e.newValue === 'dark');
    } else if (e.key === 'b0_lang' && e.newValue) {
      applyLang(e.newValue);
    }
  });

  // Check if running inside iframe (BinOS Workstation Stage)
  const isEmbedded = (paramEmbedded || window.top !== window.self);
  if (isEmbedded) {
    document.documentElement.classList.add('b0-embedded');
    // Request current theme and language from parent workstation shell
    try {
      window.parent.postMessage({ type: 'B0_REQUEST_THEME' }, '*');
      window.parent.postMessage({ type: 'B0_REQUEST_LANG' }, '*');
    } catch(e) {}
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

  // Inject Styles
  const style = document.createElement('style');
  style.textContent = `
    #b0-nav-pill-host {
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      line-height: 1;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #b0-nav-pill-host * { box-sizing: border-box; }
    
    /* Dark Mode Defaults */
    .b0-pill-bar {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 5px 10px 5px 6px;
      border-radius: 999px;
      background: rgba(15, 18, 24, 0.85);
      backdrop-filter: blur(24px) saturate(190%);
      -webkit-backdrop-filter: blur(24px) saturate(190%);
      border: 0.5px solid rgba(255, 255, 255, 0.15);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 12px 36px -4px rgba(0, 0, 0, 0.6);
      color: #f4f4f5;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .b0-pill-bar:hover {
      border-color: rgba(255, 255, 255, 0.28);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 16px 42px -6px rgba(0, 0, 0, 0.75);
    }
    .b0-pill-home {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: #fff;
      font-weight: 700;
      padding: 4px 10px 4px 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      transition: background 0.18s ease;
    }
    .b0-pill-home:hover {
      background: rgba(255, 255, 255, 0.18);
    }
    .b0-pill-logo {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      background: #fff;
      color: #000;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-family: ui-monospace, Menlo, monospace;
      font-weight: 800;
    }
    .b0-pill-sep {
      width: 1px;
      height: 12px;
      background: rgba(255, 255, 255, 0.15);
    }
    .b0-pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-family: ui-monospace, Menlo, monospace;
      font-weight: 600;
      color: ${catInfo.color};
      text-transform: uppercase;
    }
    .b0-pill-title {
      font-weight: 500;
      color: #d4d4d8;
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
      color: #a1a1aa;
      cursor: pointer;
      padding: 5px 6px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.18s ease;
    }
    .b0-pill-btn:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
    }
    .b0-menu-panel {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: 280px;
      border-radius: 16px;
      background: rgba(14, 17, 23, 0.96);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 0.5px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.7);
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
      border-radius: 10px;
      text-decoration: none;
      color: #e4e4e7;
      transition: background 0.15s ease;
    }
    .b0-menu-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
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
      font-weight: 700;
    }
    .b0-menu-name { font-weight: 600; font-size: 12px; }
    .b0-menu-desc { font-size: 10px; color: #71717a; margin-top: 1px; }

    /* Light Mode Overrides */
    html:not(.dark) .b0-pill-bar,
    html.light .b0-pill-bar {
      background: rgba(255, 255, 255, 0.88);
      border: 0.5px solid rgba(0, 0, 0, 0.12);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 12px 36px -4px rgba(0, 0, 0, 0.12);
      color: #09090b;
    }
    html:not(.dark) .b0-pill-bar:hover,
    html.light .b0-pill-bar:hover {
      border-color: rgba(0, 0, 0, 0.22);
    }
    html:not(.dark) .b0-pill-home,
    html.light .b0-pill-home {
      color: #09090b;
      background: rgba(0, 0, 0, 0.05);
    }
    html:not(.dark) .b0-pill-home:hover,
    html.light .b0-pill-home:hover {
      background: rgba(0, 0, 0, 0.09);
    }
    html:not(.dark) .b0-pill-logo,
    html.light .b0-pill-logo {
      background: #09090b;
      color: #ffffff;
    }
    html:not(.dark) .b0-pill-sep,
    html.light .b0-pill-sep {
      background: rgba(0, 0, 0, 0.1);
    }
    html:not(.dark) .b0-pill-title,
    html.light .b0-pill-title {
      color: #3f3f46;
    }
    html:not(.dark) .b0-pill-btn,
    html.light .b0-pill-btn {
      color: #52525b;
    }
    html:not(.dark) .b0-pill-btn:hover,
    html.light .b0-pill-btn:hover {
      color: #09090b;
      background: rgba(0, 0, 0, 0.06);
    }
    html:not(.dark) .b0-menu-panel,
    html.light .b0-menu-panel {
      background: rgba(255, 255, 255, 0.96);
      border: 0.5px solid rgba(0, 0, 0, 0.12);
      box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.18);
      color: #09090b;
    }
    html:not(.dark) .b0-menu-item,
    html.light .b0-menu-item {
      color: #27272a;
    }
    html:not(.dark) .b0-menu-item:hover,
    html.light .b0-menu-item:hover {
      background: rgba(0, 0, 0, 0.05);
      color: #000;
    }
    html:not(.dark) .b0-menu-desc,
    html.light .b0-menu-desc {
      color: #71717a;
    }
  `;
  document.head.appendChild(style);

  // Build DOM
  const host = document.createElement('div');
  host.id = 'b0-nav-pill-host';
  host.innerHTML = `
    <div class="b0-pill-bar">
      <a href="/#/${category}" class="b0-pill-home" title="返回 BinOS 工作台全景">
        <span class="b0-pill-logo">BinOS</span>
        <span>工作台</span>
      </a>
      <span class="b0-pill-sep"></span>
      <span class="b0-pill-badge">${catInfo.icon} ${catInfo.label}</span>
      <span class="b0-pill-title">${title}</span>
      <span class="b0-pill-sep"></span>
      <button id="b0-pill-theme-btn" class="b0-pill-btn" title="切换深色/浅色模式 (Dark/Light)" aria-label="Toggle Theme">
        <svg id="b0-pill-moon-icon" style="display:${initialDark ? 'block' : 'none'};" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg id="b0-pill-sun-icon" style="display:${initialDark ? 'none' : 'block'};" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      </button>
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
      <a href="/notes/population_structure_1950_2100.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(244,63,94,0.15); color: #f43f5e;">05</span>
          <div>
            <div class="b0-menu-name">人口结构变迁 1950–2100</div>
            <div class="b0-menu-desc">联合国数据四国动态推演模型</div>
          </div>
        </div>
      </a>
      <a href="/notes/fund_industry_cycles_2026.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(59,130,246,0.15); color: #3b82f6;">06</span>
          <div>
            <div class="b0-menu-name">公募基金与产业周期全景</div>
            <div class="b0-menu-desc">24 赛道周期量化与估值出清模型</div>
          </div>
        </div>
      </a>
      <a href="/notes/breakdown_fund_analysis_2026.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(245,158,11,0.15); color: #f59e0b;">07</span>
          <div>
            <div class="b0-menu-name">破位基金本质透视看板</div>
            <div class="b0-menu-desc">穿透技术陷阱与常识归因系统</div>
          </div>
        </div>
      </a>
      <a href="/labs/teacher_workspace.html" class="b0-menu-item">
        <div class="b0-menu-item-left">
          <span class="b0-menu-icon" style="background: rgba(16,185,129,0.15); color: #10b981;">08</span>
          <div>
            <div class="b0-menu-name">教师工作台</div>
            <div class="b0-menu-desc">高中日语教学空间与学情分析</div>
          </div>
        </div>
      </a>
    </div>
  `;

  document.body.appendChild(host);

  // Toggle Theme Button
  const themeBtn = document.getElementById('b0-pill-theme-btn');
  themeBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isNowDark = !document.documentElement.classList.contains('dark');
    try {
      localStorage.setItem('b0_theme', isNowDark ? 'dark' : 'light');
    } catch(err) {}
    applyTheme(isNowDark);
  });

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
})();
