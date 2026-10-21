/**
 * bin0sky Global Nav Pill Component (Apple Glassmorphism Edition)
 * A zero-dependency, self-contained glass floating navigation pill for standalone pages.
 * Automatically syncs theme (b0_theme) and allows instant navigation across all bin0sky tools.
 */
(function() {
  if (window.__b0_nav_pill_loaded) return;
  window.__b0_nav_pill_loaded = true;

  // Listen for parent theme bridge if embedded
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'B0_THEME_CHANGE') {
      if (e.data.theme === 'light') {
        document.documentElement.classList.remove('dark');
        document.body && document.body.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.body && document.body.classList.add('dark');
      }
    }
  });

  // If embedded in workstation iframe, parent workstation shell handles chrome & controls
  if (window.top !== window.self) {
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
    .b0-pill-bar {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 5px 10px 5px 6px;
      border-radius: 999px;
      background: rgba(15, 18, 24, 0.82);
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
      padding: 4px 6px;
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
