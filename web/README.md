# 🕹️ 中文 DOS 游戏 Web 版 · Chinese DOS Games Web Edition

在浏览器中游玩中文 DOS 游戏！基于 [js-dos v8](https://js-dos.com/) 驱动（DOSBox-X 后端），完美支持中文显示。

Play Chinese DOS games directly in your browser! Powered by [js-dos v8](https://js-dos.com/) (DOSBox-X backend) for excellent Chinese character rendering.

---

## 功能 · Features

| | 中文 | English |
|---|------|---------|
| 🎮 | **浏览器游玩** — 无需安装，在浏览器中直接运行 DOS 游戏 | **Browser Play** — Run DOS games directly in your browser, no installation needed |
| 📚 | **1898+ 款游戏** — 自动从 `games.json` 加载，首次游玩自动下载 | **1898+ Games** — Auto-loaded from `games.json`, auto-download on first play |
| ☁️ | **按需下载** — 无需 35GB 全量下载，只下载你要玩的游戏并缓存 | **On-Demand** — No 35GB upfront download; fetch + cache individual games |
| 👤 | **用户系统** — 注册/登录以管理游戏存档（可选） | **User System** — Register/login to manage game saves (optional) |
| 💾 | **双模存档** — 本地 IndexedDB (默认) 或云端服务器存档，一键切换 | **Dual Save Modes** — Local IndexedDB (default) or cloud server saves, toggle anytime |
| ☁️ | **云端存档** — 登录后可将进度上传至服务器，跨设备同步 | **Cloud Saves** — Upload progress to server after login, sync across devices |
| 🖥️ | **4K 显示屏适配** — 游戏页面在高分辨率/超宽屏上自动缩放，最高 2.5x | **4K Display Scaling** — Game page auto-scales on high-DPI/ultrawide displays, up to 2.5x |
| 🎭 | **AI 个性预设** — Wawa 两种回复风格：热情（默认）和简洁（无废话直答） | **AI Personalities** — Two response styles: warm Wawa (default) and concise Wawa (no-fluff) |
| 📤 | **上传游戏** — 拖拽上传自己的 DOS 游戏 ZIP 文件 | **Upload Games** — Drag-and-drop your own DOS game ZIP files |
| 🔍 | **自动发现** — 后台定期扫描 `bin/` 目录，自动添加新游戏 | **Auto Discovery** — Background scanner detects new games in `bin/` |
| 🌐 | **游戏元数据** — 从 Wikipedia 搜索游戏信息和介绍 | **Game Metadata** — Wikipedia search for game info & descriptions |
| 🇨🇳 | **中文支持** — UTF-8 全栈 + js-dos TTF 字体渲染 | **Chinese Support** — Full-stack UTF-8 + js-dos TTF font rendering |
| 🤖 | **AI 游戏助手** — 内置聊天机器人 "Wawa"，可看游戏画面，语音交互，面板可固定 | **AI Game Companion** — Built-in chatbot "Wawa", sees game screen, voice chat, pinnable panel |

---

## 快速开始 · Quick Start

### 方式一：Docker（推荐 · Recommended）

**云端 AI 版本**（需 API 密钥）:
```bash
docker run -d -p 5000:5000 -v dos-games-bin:/app/bin haihengh/chinese-dos-games:latest
```

**本地 AI 版本**（无需 API 密钥，完全离线）:
```bash
docker compose -f docker-compose.local-ai.yml up -d
# 首次启动自动下载 Gemma 4 E4B 模型 (~3GB)，之后完全本地运行
```

访问 · Visit: **https://localhost:5000**

> 💡 Docker 镜像自动包含 1898 款游戏元数据和封面图片。首次游玩某一游戏时从 `dos-bin.zczc.cz` 自动下载（约 5-50MB），之后使用本地缓存。无需预先下载 35GB 游戏库。
>
> 🔊 TTS 语音播报使用 Microsoft Edge 神经网络语音（普通话/广东话、男/女声），内置 edge-tts 支持。

> 🔐 **首次访问 SSL 证书**: 镜像内置了自签名 SSL 证书（10 年有效期）。首次打开 `https://localhost:5000` 时浏览器会提示证书不受信任 — 这是正常的。点击 **"高级" → "继续前往 localhost（不安全）"** 即可。证书是持久化的，之后不会再出现此提示。
>
> 🔐 **First-time SSL certificate**: The image includes a persistent self-signed SSL certificate (10-year validity). On first access, your browser will show a certificate warning — this is normal for self-signed certs. Click **"Advanced" → "Proceed to localhost (unsafe)"**. The cert persists across restarts, so you'll only need to do this once.
>
> ℹ️ HTTPS 是语音输入（麦克风）功能所必需的。没有 SSL 证书的 HTTP 连接仅在 `localhost` 上支持麦克风访问。

### 方式二：一键启动脚本

- **Windows**: 双击 `start.bat`
- **Mac/Linux**: `chmod +x start.sh && ./start.sh`

### 方式三：手动安装 · Manual Setup

**前置条件 · Prerequisites**: Python 3.10+

```bash
cd web
pip install -r requirements.txt
python app.py --ssl            # HTTPS (recommended, persistent cert)
python app.py                  # HTTP (mic only on localhost)
python app.py --ssl --port 8080  # Custom port

# First time? Generate a persistent SSL cert (avoid adhoc certs that reset on restart):
python generate_cert.py
```

访问 · Visit: **https://localhost:5000** (or `http://localhost:5000` without `--ssl`)

> 💡 **Mic input requires a secure context.** Without `--ssl`, only `http://localhost:5000` works for voice. With `--ssl`, `https://<any-host>:5000` works.
>
> 🔐 **自签名证书**: 首次访问 `https://localhost:5000` 时浏览器会显示证书警告。点击 **"高级" → "继续前往 localhost"** 即可。建议先运行 `python generate_cert.py` 生成持久化证书（保存在 `certs/` 目录），否则每次重启都会生成新证书需要重新接受。Docker 镜像已在构建时自动生成持久化证书。
>
> 🔐 **Self-signed certificate**: Browsers will show a certificate warning on first access to `https://localhost:5000`. Click **"Advanced" → "Proceed to localhost"** to accept. Run `python generate_cert.py` first to create a persistent cert (stored in `certs/`); without it, Flask falls back to adhoc certs that regenerate on every restart. The Docker image includes a persistent cert generated at build time.

### 可选：中文字体 · Optional: Chinese Font

为了在 js-dos 中获得最佳中文字符显示效果，推荐放置一个 CJK TTF 字体：

For the best Chinese character display in js-dos, place a CJK TTF font file:

1. 下载 [WenQuanYi Micro Hei](https://wenq.org/) 或其他 CJK 字体<br>
   Download [WenQuanYi Micro Hei](https://wenq.org/) or another CJK font
2. 将字体文件保存为 `data/wenquanyi.ttf`<br>
   Save the font file as `data/wenquanyi.ttf`
3. 重新生成游戏 bundle（删除 `jsdos_cache/` 目录后重启）<br>
   Regenerate game bundles (delete `jsdos_cache/` directory and restart)

> 没有字体文件时，js-dos 会使用 DBCS 位图字体作为后备方案。许多中文 DOS 游戏使用图形方式渲染文字，即使没有 TTF 字体也能正常显示。
>
> Without a TTF font, js-dos falls back to DBCS bitmap rendering. Many Chinese DOS games render text graphically, so they display correctly even without a TTF font.

---

## 项目结构 · Project Structure

```
web/
├── app.py                       # Flask 主应用 · Flask main application
├── config.py                    # 配置 · Configuration (paths, JWT, CDN)
├── database.py                  # SQLite 数据库 · SQLite database connection
├── requirements.txt             # Python 依赖 · Python dependencies
├── .gitignore
│
├── models/                      # 数据模型 · Data models
│   └── game.py                  #   游戏 CRUD + JSON 导入 · Game CRUD + JSON import
│
├── services/                    # 业务逻辑 · Business logic
│   ├── auth_service.py          #   用户认证 · User auth (register/login/JWT)
│   ├── bundle_service.py        #   ZIP → .jsdos 转换 · ZIP to .jsdos conversion
│   ├── download_service.py      #   游戏按需下载 · Game-on-demand download
│   ├── save_service.py          #   存档管理 · Save state management
│   ├── upload_service.py        #   上传处理 · Upload processing
│   ├── scanner_service.py       #   后台扫描 · Background scanner
│   ├── metadata_service.py      #   Wikipedia 搜索 · Wikipedia metadata search
│   └── ai_service.py            #   AI 聊天代理 · AI chat proxy (Anthropic + OpenAI-compatible)
│
├── shared/                      # 公共工具 · Shared utilities
│   ├── game_util.py             #   ZIP 检查/可执行文件检测 · ZIP inspection / executable detection
│   └── dosbox_conf.py           #   js-dos 配置生成 · js-dos config generation
│
├── templates/                   # Jinja2 HTML 模板 · Jinja2 HTML templates
│   ├── base.html                #   布局框架 · Layout shell (navbar, footer)
│   ├── index.html               #   首页 · Landing page
│   ├── games.html               #   游戏列表 · Game browser
│   ├── game.html                #   游戏播放器 · Game player (js-dos canvas)
│   ├── login.html               #   登录 · Login
│   ├── register.html            #   注册 · Register
│   ├── profile.html             #   个人中心 · User profile
│   ├── upload.html              #   上传 · Upload
│   └── 404.html                 #   错误页 · Error page
│
├── static/                      # 静态资源 · Static assets
│   ├── css/
│   │   ├── main.css             #   主样式 · Main stylesheet (dark theme)
│   │   └── chat.css             #   AI 聊天面板样式 · AI chat panel styles
│   ├── js/
│   │   ├── app.js               #   全局脚本 · Global (auth state, nav, toasts)
│   │   ├── game.js              #   js-dos 播放器 · js-dos player integration
│   │   ├── chat.js              #   AI 聊天前端 · AI chat frontend (voice, screenshot, settings)
│   │   ├── auth.js              #   登录/注册 · Login/register forms
│   │   └── upload.js            #   上传 · Drag-and-drop upload
│   └── img/no-cover.png         #   默认封面 · Placeholder cover
│
├── data/                        # 数据文件 · Data files
│   └── schema.sql               #   数据库 Schema · Database schema (5 tables)
│
└── jsdos_cache/                 # .jsdos Bundle 缓存 · Bundle cache (gitignored)
```

---

## 数据库 · Database Schema

5 张表 · 5 tables:

| 表 · Table | 说明 · Description |
|------------|-------------------|
| `users` | 用户 · Users (username, password_hash, is_admin) |
| `games` | 游戏 · Games (identifier, name_zh, executable, type, sha256, filesize, cover, ...) |
| `user_saves` | 存档 · Game saves (user_id, game_identifier, save_data BLOB) |
| `uploads` | 上传记录 · Upload tracking (user_id, filename, status) |
| `game_metadata_cache` | 元数据缓存 · Wikipedia metadata cache |

---

## API 概览 · API Overview

### 公开接口 · Public Endpoints

| 端点 · Endpoint | 说明 · Description |
|-----------------|-------------------|
| `GET /api/games` | 游戏列表（分页、筛选、搜索）· Game list (paginated, filterable by type/search) |
| `GET /api/games/<id>` | 单个游戏详情 · Single game details |
| `GET /api/games/<id>/cover` | 封面图片 · Cover image |
| `GET /api/games/<id>/bundle` | .jsdos 游戏包（动态生成）· .jsdos bundle (generated on-the-fly) |
| `GET /api/games/types` | 游戏类型及数量 · Game types with counts |
| `GET /api/metadata/<id>` | Wikipedia 元数据 · Wikipedia metadata |
| `GET /api/ai/status` | AI 服务状态 · AI service status |
| `GET /api/ai/personalities` | AI 个性预设列表 · Available personality presets |
| `POST /api/ai/chat` | AI 聊天（支持截屏、个性选择）· AI chat (with screenshot, personality) |
| `POST /api/tts` | 文字转语音 (Edge TTS 神经网络) · Text-to-speech (Edge TTS) |

### 需要登录 · Auth Required

| 端点 · Endpoint | 说明 · Description |
|-----------------|-------------------|
| `POST /api/auth/register` | 注册 · Register `{username, password}` |
| `POST /api/auth/login` | 登录 · Login → JWT token (72h) |
| `GET /api/auth/me` | 当前用户信息 · Current user info |
| `GET /api/games/<id>/save` | 下载存档 · Download save BLOB |
| `POST /api/games/<id>/save` | 上传存档 · Upload save BLOB |
| `DELETE /api/games/<id>/save` | 删除存档 · Delete save |
| `POST /api/upload` | 上传游戏 ZIP · Upload game ZIP (multipart) |
| `GET /api/uploads` | 上传历史 · User's upload history |

### 管理员 · Admin Only

| 端点 · Endpoint | 说明 · Description |
|-----------------|-------------------|
| `POST /api/admin/scan` | 手动触发 bin/ 扫描 · Trigger manual bin/ scan |

---

## 前端页面 · Frontend Pages

| 路由 · Route | 页面 · Page |
|-------------|------------|
| `GET /` | 首页（精选游戏、类型统计）· Landing (featured games, type stats) |
| `GET /games` | 游戏列表（筛选、搜索、分页）· Game browser (filters, search, pagination) |
| `GET /games/<id>` | 游戏播放器（js-dos 画布 + 侧边栏）· Game player (js-dos canvas + sidebar) |
| `GET /login` | 登录 · Login |
| `GET /register` | 注册 · Register |
| `GET /profile` | 个人中心 · Profile |
| `GET /upload` | 上传游戏 · Upload game |

---

## 游戏播放流程 · Game Playing Flow

```
用户访问 /games/<id>
  → game.html 加载 js-dos v8 CDN 脚本 (jsdelivr)
  → game.js 调用 Dos(canvas, { url: BUNDLE_URL, backend: "dosboxX", autoStart: true })
  → js-dos v8 内部请求 GET /api/games/<id>/bundle

Bundle 端点 (bundle_service.py):
  → 检查 jsdos_cache/<id>.jsdos 是否存在且 SHA256 匹配 bin/<id>.zip
  → 未命中: 读取原始 ZIP → 注入 .jsdos/dosbox.conf + 可选 TTF 字体 → 写入缓存
  → 命中: 从缓存直接返回
  → 返回 application/zip（作为 .jsdos bundle）

js-dos v8 接收 bundle:
  → 解压到虚拟文件系统 (Emscripten MEMFS)
  → 读取 .jsdos/dosbox.conf (DOSBox-X 配置)
  → 挂载 IDBFS 持久化层 (如果存在历史存档则自动恢复)
  → js-dos 启动模拟器 → autoexec 运行游戏主程序
  → 游戏渲染在 <canvas> 上
  → onEvent('ci-ready') 触发 → 隐藏加载遮罩 → 游戏可操作
```

```
User visits /games/<id>
  → game.html loads js-dos v8 CDN scripts (jsdelivr)
  → game.js calls Dos(canvas, { url: BUNDLE_URL, backend: "dosboxX", autoStart: true })
  → js-dos v8 internally requests GET /api/games/<id>/bundle

Bundle endpoint (bundle_service.py):
  → Check jsdos_cache/<id>.jsdos exists & SHA256 matches bin/<id>.zip
  → MISS: Read source ZIP → inject .jsdos/dosbox.conf + optional TTF font → write cache
  → HIT: Stream from cache
  → Returns application/zip (as .jsdos bundle)

js-dos v8 receives bundle:
  → Unpacks to virtual filesystem (Emscripten MEMFS)
  → Reads .jsdos/dosbox.conf (DOSBox-X backend config)
  → Mounts IDBFS persistence layer (auto-restores if prior save exists)
  → js-dos boots emulator → autoexec launches game executable
  → Game renders on <canvas>
  → onEvent('ci-ready') fires → hides loading overlay → game is playable
```

---

## js-dos 配置模板 (DOSBox-X) · js-dos Config Template (DOSBox-X)

```ini
[sdl]
output=opengl
fullscreen=false

[dosbox]
machine=svga_s3
memsize=16

[cpu]
cycles=max
core=auto

[dosboxx]
language=chs
ttf.font=wenquanyi.ttf        # 如果有字体文件 · If font file exists
ttf.fontsize=18
dosv=chs

[config]
country=86,936                 # 简体中文 GBK · Simplified Chinese

[autoexec]
@echo off
mount C .
C:
PLAY.BAT                        # 自动检测的可执行文件 · Auto-detected executable
```

---

## 存档架构 · Save Architecture

js-dos 会自动将游戏状态保存到浏览器的 IndexedDB，确保页面刷新后能自动恢复游戏进度。存档使用 **一致的 Bundle URL**，确保 js-dos 能够正确查找和加载以前的保存。

js-dos automatically saves game state to the browser's IndexedDB, ensuring game progress is automatically restored after page refresh. Saves use a **consistent Bundle URL** so js-dos can correctly locate and load previous saves.

```
┌────────────────────────────────────────────────┐
│ 1. js-dos 虚拟文件系统 (Emscripten MEMFS)     │
│    游戏运行时所有文件变更在内存中                │
│    ↓  js-dos autoSave: true                    │
│                                                │
│ 2. 浏览器 IndexedDB (Emscripten IDBFS)          │
│    数据库名由 BUNDLE_URL 决定                    │
│    Database name keyed by consistent BUNDLE_URL │
│    /api/games/{GAME_ID}/bundle                 │
│    ★ 页面刷新后自动恢复                         │
│    ★ Auto-restored on page refresh             │
│                                                │
│ 3. 存档数据 (序列化格式)                        │
│    Save Bundle (serialized format)             │
│    { v:1, game:"<id>", ts:<unix_ms>, ...}      │
└────────────────────────────────────────────────┘
```

### 关键点 · Key Points

- ✅ **Consistent Bundle URL**: 游戏始终使用 `/api/games/{GAME_ID}/bundle` 加载，确保 js-dos 能找到之前的存档
  - All games always load from `/api/games/{GAME_ID}/bundle`, ensuring js-dos finds previous saves
- ✅ **自动保存 · Auto-Save**: `autoSave: true` 使 js-dos 定期保存到 IndexedDB
  - `autoSave: true` enables periodic auto-save to IndexedDB
- ✅ **无需认证 · No Auth Required**: 存档完全在浏览器本地存储，不需要登录
  - Saves are entirely local to the browser, no login required
- ✅ **页面刷新自动恢复 · Auto-Restore on Refresh**: 刷新页面时 js-dos 自动加载之前的存档
  - Page refresh automatically restores previous saves
- ✅ **双模存档 · Dual Save Modes**: 游戏控制栏提供 💻 本地 / ☁️ 云端切换
  - Game toolbar has a 💻 Local / ☁️ Cloud toggle
- ✅ **云端同步 · Cloud Sync** (需登录): 上传存档至服务器，可跨设备下载恢复
  - (requires login): Upload saves to server, download on any device
- ✅ **本地优先 · Local First**: 云端保存前先同步至 IndexedDB，确保本地有备份
  - Cloud save syncs to IndexedDB first, ensuring a local backup

### 保存流程 · Save Flow

```
用户在游戏中按 Ctrl+S 或点击"💾 保存"按钮
  → dosCI.persist() 触发 MEMFS → IndexedDB 同步
  → 游戏状态保存到浏览器 IndexedDB
  → 显示"已保存 ✅"

User presses Ctrl+S in game or clicks "💾 Save" button
  → dosCI.persist() triggers MEMFS → IndexedDB sync
  → Game state saved to browser IndexedDB
  → Shows "Saved ✅"
```

### 加载流程 · Load Flow

```
用户刷新浏览器或重新访问游戏页面
  → game.js 调用 createDosPlayer()
  → 使用一致的 BUNDLE_URL
  → js-dos 挂载 IDBFS 并从 IndexedDB 恢复文件系统
  → 游戏自动加载到之前的存档点

User refreshes browser or revisits game page
  → game.js calls createDosPlayer()
  → Uses consistent BUNDLE_URL
  → js-dos mounts IDBFS and restores filesystem from IndexedDB
  → Game automatically loads at previous save point
```

### js-dos v8 API 对照 · API Mapping

| 操作 · Operation | 说明 · Description |
|---------|---------|
| `Dos(el, { url, ... })` | 初始化 js-dos 播放器 · Initialize js-dos player |
| `dosProps.setPaused(bool)` | 暂停/继续游戏 · Pause/resume game |
| `dosProps.setFullScreen(bool)` | 全屏模式 · Toggle fullscreen |
| `dosProps.setVolume(n)` | 设置音量 (0-1) · Set volume (0-1) |
| `await dosProps.stop()` | 停止游戏 · Stop game |
| `dosCI.persist()` | 同步 MEMFS → IndexedDB · Sync MEMFS to IndexedDB |
| `dosCI.screenshot()` | 捕获当前画面 (用于 AI 助手) · Capture frame (used by AI companion) |
| `onEvent: 'ci-ready'` | 游戏加载完成回调 · Game ready callback |
| `autoSave: true` | 启用自动保存 · Enable auto-save |

---

## AI 游戏助手 · AI Game Companion

游戏页面内置 AI 聊天助手 **"Wawa"**，可以看见你的游戏画面并提供实时帮助。

The game page includes an AI chat companion **"Wawa"** that sees your game screen and provides real-time help.

### 功能 · Features

| 功能 · Feature | 说明 · Description |
|---------------|-------------------|
| 🖼️ **游戏截屏** | 使用 js-dos 原生 API (`ci.screenshot()`) 捕获 WebGL 画面，JPEG 85% 质量 · Native js-dos API for WebGL capture, JPEG 85% quality |
| 🎤 **语音输入** | 浏览器语音识别，5 种语言可选（普通话 / 粵語 yue-Hant-HK / 粵語 zh-HK / 台灣國語 / English）· Browser speech recognition with 5 language options |
| ⚠️ **粵語限制** | Web Speech API 粵語支持取决于浏览器：Chrome/Edge 通常可用，Firefox/Safari 有限制 · Cantonese support varies by browser: Chrome/Edge usually OK, Firefox/Safari limited |
| 🔊 **语音播报** | Edge TTS 神经网络语音 (普通话/广东话, 男/女声可选) + 浏览器 TTS 后备 · Neural Edge TTS (Mandarin/Cantonese, M/F voice) + browser fallback |
| 📌 **面板固定** | 固定聊天面板，隐藏遮罩层，可边玩边看 AI 回复 · Pin panel to keep it open while playing the game |
| 🏠 **本地 AI** | 内置 Ollama + Gemma 4 E4B 支持，完全离线运行，无需 API 密钥 · Built-in Ollama + Gemma 4 E4B, fully offline, no API key needed |
| ⚙️ **自定义 AI** | 也支持 Anthropic / OpenAI / DeepSeek 云 API · Also supports cloud APIs (Anthropic, OpenAI, DeepSeek) |
| 🖥️ **页面不遮挡** | 打开聊天面板时整个页面向右平移，游戏画面不被遮挡 · Page shifts right when chat opens, game stays fully visible |
| 🎭 **个性预设** | 两种回复风格可选 — Wawa 热情（默认，活泼鼓励） / Wawa 简洁（1-3句，直接给答案） · Two personalities: warm (default, enthusiastic) / concise (1-3 sentences, direct) |
| 🎯 **游戏感知** | AI 自动获知当前游戏名称、类型、操作按键和秘籍 · AI knows current game name, genre, controls & cheats |
| 📐 **可调面板** | 左侧固定面板，可拖拽调整宽度 (280-480px)，首次访问自动展开 · Left-side fixed panel, resizable (280-480px), auto-opens on first visit |
| 🗑️ **缓存管理** | 一键清除所有聊天记录、AI 设置和偏好 · One-click clear all chat history, AI settings, and preferences |
| 💬 **对话记忆** | 对话历史保存在浏览器 localStorage，刷新不丢失 · Chat history persisted in localStorage |
| 📐 **可调面板** | 左侧固定面板，可拖拽调整宽度 (280-480px) · Left-side fixed panel, resizable (280-480px) |

### 配置 · Configuration

**方式一：服务器密钥（管理员配置）· Server Key (admin configured)**

```bash
# 设置环境变量 · Set environment variable
export ANTHROPIC_API_KEY="sk-ant-..."    # Linux/Mac
$env:ANTHROPIC_API_KEY = "sk-ant-..."    # PowerShell
```

**方式二：自备密钥（用户配置）· User Key (self-configured)**

1. 打开任意游戏页面
2. 点击 "🤖 助手" 按钮打开聊天面板
3. 点击聊天面板顶部的 "⚙️" 设置按钮
4. 填写：
   - **AI 提供商**: Anthropic (Claude) 或 OpenAI 兼容 (DeepSeek 等)
   - **API 密钥**: 你的 API 密钥
   - **模型名称**: 如 `claude-sonnet-4-20250514`、`gpt-4o`、`deepseek-chat`
   - **API 地址**: (OpenAI 模式可选) 如 `https://api.deepseek.com/v1`
   - **AI 个性**: Wawa 热情（默认）或 Wawa 简洁（直答无废话）
   - **TTS 语音**: 普通话/广东话，男声/女声
   - **TTS 语速**: 慢速/标准/较快/快速
5. 点击保存

> 💡 **DeepSeek 用户**: 选择"OpenAI 兼容"，API 地址填 `https://api.deepseek.com/v1`，模型填 `deepseek-chat`（支持截屏）或 `deepseek-reasoner`（不支持截屏，自动回退文字模式）。

用户密钥保存在浏览器 localStorage，仅随聊天请求发送。

User keys are stored in browser localStorage, only sent with chat requests.

### 工作流程 · How It Works

```
用户打开聊天面板
  → body 添加 chat-open 类 → padding-left 平滑过渡 → 页面右移不遮挡游戏
  → 点击输入框 → capture-phase 键盘拦截器阻断 js-dos 事件劫持 → 游戏继续运行
  → 用户输入消息 (文本 / 语音)
    → chat.js: captureScreenshot() (async)
        ├─ 主: window.DOS.Game.captureScreenshot() → dosCI.screenshot() (读取 WebGL 缓冲区)
        └─ 备: canvas 扫描 → toDataURL (fallback)
    → POST /api/ai/chat {
        messages: [...history],
        screenshot: "base64...",
        api_key: "sk-...",      // 可选 · Optional
        provider: "anthropic",   // 可选 · Optional
        model: "claude-...",     // 可选 · Optional
        personality: "wawa",     // 可选 · Optional (wawa 热情 / wawa-concise 简洁)
      }
    → ai_service.py: 解析配置 → 调用 AI API
    → AI 回复 → 渲染消息气泡
    → [可选: TTS 语音播报] → POST /api/tts → Edge TTS (普通话/广东话, 男/女声) → 播放 MP3
    → 对话历史保存到 localStorage
  → 发送后自动失焦输入框 → 键盘归还游戏 → 游戏不受影响继续运行
```

### AI 系统提示 · System Prompt

Wawa 支持两种个性预设，通过设置面板实时切换：

| 个性 · Personality | 风格 · Style |
|-------------------|-------------|
| **Wawa 热情** (默认) | 熟悉 1980-90 年代中文 DOS 游戏的热情 AI 助手，简体中文回复，2-4 段，适当使用表情符号，对老游戏保持尊重和怀念 |
| **Wawa 简洁** | 极简回答，1-3 句，无表情符号，直接给答案不废话，最多 50 字 |

两种个性均能分析游戏截屏中的文字、UI 和游戏状态，了解各种游戏类型的常见谜题和策略。

---

## 上传流程 · Upload Flow

```
用户访问 /upload（需登录）
  → 拖拽 ZIP 文件到上传区域
  → 客户端验证: .zip 后缀, < 200MB
  → POST /api/upload (multipart + JWT)

服务端处理:
  1. 保存到临时目录
  2. 检查 ZIP → 查找可执行文件 (PLAY.BAT > *.BAT > *.EXE > *.COM)
  3. 计算 SHA256
  4. 复制到 bin/<identifier>.zip
  5. 写入 games 表 (source='upload')
  6. 返回 identifier → 前端跳转到游戏页面
```

```
User visits /upload (auth required)
  → Drops ZIP file onto upload zone
  → Client validates: .zip extension, < 200MB
  → POST /api/upload (multipart + JWT)

Server processing:
  1. Save to temp directory
  2. Inspect ZIP → find executable (PLAY.BAT > *.BAT > *.EXE > *.COM)
  3. Compute SHA256
  4. Copy to bin/<identifier>.zip
  5. Insert into games table (source='upload')
  6. Return identifier → frontend redirects to game page
```

---

## 自动发现 · Auto Discovery

后台线程每 5 分钟执行一次 · Background thread runs every 5 minutes:

```
扫描 bin/ 目录 → 列出所有 .zip 文件
  → 与数据库 games 表对比
  → 新文件:
      - 检查 games.json SHA256 匹配 → 使用元数据
      - 否则: 自动检测可执行文件 → 插入 (source='scan')
  → 记录日志
```

---

## 技术栈 · Tech Stack

| 层 · Layer | 技术 · Technology |
|-----------|------------------|
| 后端 · Backend | Flask 3.x + SQLite3 |
| 认证 · Auth | JWT (PyJWT, HS256, 72h) |
| 密码哈希 · Password | Werkzeug (scrypt) |
| 前端 · Frontend | Vanilla HTML/CSS/JS (zero build step) |
| CSS 框架 · CSS | Custom dark theme + CSS Grid/Flexbox |
| 字体 · Font | Noto Sans SC (Google Fonts) |
| DOS 模拟 · DOS Emulation | [js-dos v8](https://js-dos.com/) (DOSBox-X backend) via jsDelivr CDN |
| 后端引擎 · Backend Engine | DOSBox-X (CJK TTF + DBCS) — internal, managed by js-dos |
| 元数据 · Metadata | Wikipedia API |
| AI 聊天 · AI Chat | Anthropic Claude API + OpenAI-compatible (vision) |
| 语音输入 · Voice In | Web Speech API (SpeechRecognition) |
| 语音播报 · Voice Out | Edge TTS (zh-CN-XiaoxiaoNeural) + Web Speech API fallback |
| 运行环境 · Runtime | Python 3.10+ |

---

## 游戏类型分布 · Game Types

| 类型 · Type | 名称 · Name | 数量 · Count |
|------------|------------|-------------|
| ACT | 动作 · Action | 523 |
| SIM | 模拟 · Simulation | 312 |
| RPG | 角色扮演 · Role-Playing | 262 |
| AVG | 冒险 · Adventure | 196 |
| PUZ | 益智 · Puzzle | 185 |
| SLG | 策略 · Strategy | 171 |
| HGA | 成人 · Adult | 90 |
| SPG | 体育 · Sports | 73 |
| RTS | 即时战略 · Real-Time Strategy | 44 |

**总计 · Total: 1,898 款游戏 · games**

---

## 参与贡献 · Contributing

欢迎提交 Issue 和 Pull Request！Welcome to submit Issues and Pull Requests!

上游数据仓库 · Upstream data repo: [rwv/chinese-dos-games](https://github.com/rwv/chinese-dos-games)

---

## 许可证 · License

本项目代码采用 MIT 许可证。游戏文件版权归各自原作者所有。

This project's code is MIT licensed. Game files are copyrighted by their respective owners.
