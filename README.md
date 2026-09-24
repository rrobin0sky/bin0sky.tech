# bin0sky.tech — Official Digital Studio Portal

> A minimalist, monochrome studio portal built for high-performance engineering tools and macOS native applications.

## 🚀 Features

- **Apple Restraint & Google Simplicity**: Obsidian black (`#000000`) & paper canvas (`#ffffff`) monochrome design language.
- **Multilingual Support**: English (`EN`), 简体中文 (`简`), 繁體中文 (`繁`), and 日本語 (`JA`) with auto-detection & persistent preferences.
- **⌘K Quick Launcher**: Instant keyboard-driven omnibox command palette to jump to any tool or switch themes.
- **Keyboard Shortcuts**:
  - `1`: Open **ArchIcons** (`icon.bin0sky.tech`)
  - `2`: Open **SlideCraft** (`ppt.bin0sky.tech`)
  - `3`: Open **AIConsole** (`console.bin0sky.tech`)
  - `4`: Open **Ambient 4K** (`ambient.bin0sky.tech`)
  - `T`: Toggle light/dark monochrome theme
  - `⌘K`: Open command palette
- **Zero Build Dependencies**: Pure vanilla HTML5 + Tailwind CSS CDN + Lucide Icons. Ultra-fast, zero maintenance.

---

## 🌐 Cloudflare Pages Deployment Guide

1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "feat: initial release of bin0sky studio portal"
   git branch -M main
   git remote add origin https://github.com/rrobin0sky/bin0sky.tech.git
   git push -u origin main
   ```

2. Go to **Cloudflare Dashboard** → **Workers & Pages** → **Create Application** → **Pages** → **Connect to Git**.
3. Select your repository `bin0sky.tech`.
4. Build Settings:
   - **Framework preset**: `None`
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/` (or leave empty / `.`)
5. In **Custom Domains**, add:
   - `bin0sky.tech` (Primary Apex Domain)
   - `www.bin0sky.tech` (The included `_redirects` file automatically handles 301 redirection to apex domain)

---

## 🔗 (Optional) Ecosystem Switcher for Your 4 Sub-sites

To create cross-promotional traffic between `ppt`, `icon`, `ambient`, and `console`, you can add this minimal top-right pill to the header of your other websites:

```html
<a href="https://bin0sky.tech" target="_blank" title="Explore bin0sky Suite"
   style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:#a1a1aa;font-size:11px;font-family:monospace;text-decoration:none;transition:all 0.2s;"
   onmouseover="this.style.color='#ffffff';this.style.borderColor='rgba(255,255,255,0.3)'"
   onmouseout="this.style.color='#a1a1aa';this.style.borderColor='rgba(255,255,255,0.12)'">
  <span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>
  <span>bin0sky Studio</span>
</a>
```
