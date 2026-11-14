# bin0sky.tech — Official Digital Studio & Engineering Lab

> 专为工程师与思索者打造的原生极简数字工具矩阵、交互式深度研报与实验空间。

## 🏛️ 项目矩阵映射表 (Local & Cloudflare)

| 产品 / 内容 | 线上访问地址 | 本地文件夹路径 | 对应 GitHub 仓库 | 角色分类 |
| :--- | :--- | :--- | :--- | :--- |
| **Studio Portal** | `bin0sky.tech` | `/Antigravity/bin0sky.tech` | `rrobin0sky/bin0sky.tech` | 门户与研报中心 |
| **01 ArchIcons** | `bin0sky.tech/icon` / `icon.bin0sky.tech` | `/Antigravity/online-ai-archicons` | `rrobin0sky/online-ai-archicons` | 🚀 生产力工具 APPS |
| **02 SlideCraft** | `bin0sky.tech/ppt` / `ppt.bin0sky.tech` | `/Antigravity/online-ai-slidecraft` | `rrobin0sky/online-ai-slidecraft` | 🚀 生产力工具 APPS |
| **03 AIConsole** | `bin0sky.tech/console` / `console.bin0sky.tech` | `/Antigravity/online-ai-aiconsole` | `rrobin0sky/online-ai-aiconsole` | 🚀 生产力工具 APPS |
| **04 Ambient 4K** | `bin0sky.tech/ambient` / `ambient.bin0sky.tech` | `/Antigravity/online-ai-ambient` | `rrobin0sky/online-ai-ambient` | 🚀 生产力工具 APPS |
| **05 NetBOM** | `bin0sky.tech/bom` / `bom.bin0sky.tech` | `/Antigravity/online-ai-netbom` | `rrobin0sky/online-ai-netbom` | 🚀 生产力工具 APPS |
| **06 NetPath-Lens** | `bin0sky.tech/nettest` / `nettest.bin0sky.tech` | `/Antigravity/online-ai-nettest` | `rrobin0sky/online-ai-nettest` | 🚀 生产力工具 APPS |
| **07 MDView** | `bin0sky.tech/mdview` / `mdview.bin0sky.tech` | `/Antigravity/online-ai-mdview` | `rrobin0sky/online-ai-mdview` | 🚀 生产力工具 APPS |
| **08 人口结构变迁**| `bin0sky.tech/notes/population_structure_1950_2100.html` | `/Antigravity/bin0sky.tech/notes/` | `rrobin0sky/bin0sky.tech` | 📑 交互研报 NOTES |
| **09 Time Slice Radio** | `bin0sky.tech/radio` / `radio.bin0sky.tech` | `/Antigravity/online-ai-radio` | `rrobin0sky/online-ai-radio` | 🧪 实验空间 LABS |

---

## 🎨 视觉与交互架构

- **左侧结构化目录树 / 小图标轨 (Icon Rail)**：常驻左侧，支持在「完整目录 (240px)」与「微型图标列 (68px)」之间平滑折叠，内置悬浮 Tooltip 气泡。
- **三槽位内容体系**：`🚀 APPS` (高可用工具) + `📑 NOTES` (交互研报) + `🧪 LABS` (实验与微算法)。
- **全站通用浮动胶囊 (`shared/nav-pill.js`)**：在任意子应用或研报中引入一行脚本即可获得统一的磨砂玻璃返回与生态切换体验。
- **⌘K 快速检索**：支持按键 `1`~`5` 秒级直达，按 `T` 切换深浅模式。

---

## 🌐 边缘路由代理 (Cloudflare Worker)

详见 [cloudflare/README.md](cloudflare/README.md) 了解如何通过几行边缘 Worker 实现全站统一主域名无缝访问。

---

## 🔐 生产环境密钥配置 (`wrangler secret put`)

为防止代码仓库中硬编码敏感凭证，边缘 Worker 强制依赖 Cloudflare Secret 环境变量（未配置时鉴权接口将安全降级/拒绝响应）：

- **主站网关 (`bin0sky-tech`)**：
  ```bash
  npx wrangler secret put JWT_SECRET
  # 可选：自定义管理员静默白名单与应急初始化密钥
  npx wrangler secret put ADMIN_USERNAMES
  npx wrangler secret put ADMIN_EMAILS
  npx wrangler secret put ADMIN_INIT_KEY
  ```
- **Ambient 4K (`online-ai-ambient`)**：
  ```bash
  npx wrangler secret put VIP_PASSCODE
  # 可选：覆盖内置 Wallhaven Key
  npx wrangler secret put VIP_WALLHAVEN_KEY
  ```

---

## 🗄️ Cloudflare D1 统一身份与业务数据库初始化

1. 创建 D1 数据库并获取输出的 `database_id`：
   ```bash
   npx wrangler d1 create bin0sky-auth-db
   ```
2. 将输出中的 `database_id` 填入 `wrangler.json` 中 `d1_databases[0].database_id`。
3. 执行表结构初始化迁移：
   ```bash
   npx wrangler d1 migrations apply bin0sky-auth-db --remote
   ```
4. 部署后，使用管理员身份调用一次性幂等迁移接口将存量 `TEACHER_KV` 数据导入 D1：
   ```bash
   curl -X POST https://bin0sky.tech/api/admin/migrate-kv-to-d1 \
     -H "Authorization: Bearer <ADMIN_TOKEN>"
   ```
