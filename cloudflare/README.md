# bin0sky Edge Gateway Worker (Cloudflare)

用于实现 `bin0sky.tech` 单域名统一体验，无需跨域跳转即可直接访问各个工具与研报。

## 📍 路由映射表

| 访问路径 (单一域名) | 实际代理服务 | 本地文件夹 | 说明 |
| :--- | :--- | :--- | :--- |
| `bin0sky.tech/` | `bin0sky.tech` (Pages) | `bin0sky.tech` | 主站门户（小图标轨 + 弱边框卡片流） |
| `bin0sky.tech/notes/*` | `bin0sky.tech` (Pages) | `bin0sky.tech/notes/` | 深度交互研报（如人口结构变迁 1950–2100） |
| `bin0sky.tech/icon/*` | `https://icon.bin0sky.tech` | `ArchIcons` | 网络拓扑与云架构矢量设备图标库 |
| `bin0sky.tech/ppt/*` | `https://ppt.bin0sky.tech` | `AiPPT-Web` | SlideCraft AI 演示文稿工作台 |
| `bin0sky.tech/console/*` | `https://console.bin0sky.tech` | `AIconsole/web` | macOS 原生 AI 终端 Web 版 |
| `bin0sky.tech/ambient/*` | `https://ambient.bin0sky.tech` | `Ambient4K-Web` | 4K 视觉画廊与声学专注空间 |
| `bin0sky.tech/bom/*` | `https://bom.bin0sky.tech` | `online-ai-netbom` | NetBOM 网络设备智能物料与报价工作台 |

## 🚀 Cloudflare 部署步骤（3 步）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers 和 Pages** → **创建应用程序** → **创建 Worker**（命名为 `bin0sky-gateway`）。
2. 点击 **编辑代码**，将 `worker.js` 中的内容完整粘贴并点击 **部署**。
3. 点击 **设置 (Settings)** → **域和路由 (Domains & Routes)** → **添加自定义域**，输入 `bin0sky.tech` 保存生效。
