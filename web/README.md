# 🕹️ 中文 DOS 游戏 Web 版 · Chinese DOS Games Web Edition

在浏览器中游玩中文 DOS 游戏！基于 [js-dos v8](https://js-dos.com/) 驱动，支持 DOSBox-X 后端以获得更好的中文字符显示。

Play Chinese DOS games directly in your browser! Powered by [js-dos v8](https://js-dos.com/) with DOSBox-X backend for optimal Chinese character rendering.

---

## 功能 · Features

| | 中文 | English |
|---|------|---------|
| 🎮 | **浏览器游玩** — 无需安装，在浏览器中直接运行 DOS 游戏 | **Browser Play** — Run DOS games directly in your browser, no installation needed |
| 📚 | **1898+ 款游戏** — 自动从 `games.json` 和 `bin/` 目录加载 | **1898+ Games** — Auto-loaded from `games.json` and `bin/` directory |
| 👤 | **用户系统** — 注册/登录以管理游戏存档（可选） | **User System** — Register/login to manage game saves (optional) |
| 💾 | **本地存档** — 游戏进度自动保存到浏览器 IndexedDB，刷新后自动恢复 | **Local Saves** — Game progress auto-saves to browser IndexedDB, auto-restored on refresh |
| 📤 | **上传游戏** — 拖拽上传自己的 DOS 游戏 ZIP 文件 | **Upload Games** — Drag-and-drop your own DOS game ZIP files |
| 🔍 | **自动发现** — 后台定期扫描 `bin/` 目录，自动添加新游戏 | **Auto Discovery** — Background scanner detects new games in `bin/` |
| 🌐 | **游戏元数据** — 从 Wikipedia 搜索游戏信息和介绍 | **Game Metadata** — Wikipedia search for game info & descriptions |
| 🇨🇳 | **中文支持** — UTF-8 全栈 + DOSBox-X TTF 字体渲染 | **Chinese Support** — Full-stack UTF-8 + DOSBox-X TTF font rendering |

---

## 快速开始 · Quick Start

### 前置条件 · Prerequisites

- Python 3.10+
- 游戏文件已下载到父目录的 `bin/` 文件夹 · Game ZIPs downloaded to parent `bin/` directory
- 游戏元数据 `games.json` 在父目录 · Game metadata `games.json` in parent directory

### 安装运行 · Install & Run

```bash
# 1. 进入 web 目录 · Enter web directory
cd web

# 2. 安装依赖 · Install dependencies
pip install -r requirements.txt

# 3. 启动服务器 · Start server
python app.py
```

访问 · Visit: **http://localhost:5000**

### 可选：中文字体 · Optional: Chinese Font

为了在 DOSBox-X 中获得最佳中文字符显示效果，推荐放置一个 CJK TTF 字体：

For the best Chinese character display in DOSBox-X, place a CJK TTF font file:

1. 下载 [WenQuanYi Micro Hei](https://wenq.org/) 或其他 CJK 字体<br>
   Download [WenQuanYi Micro Hei](https://wenq.org/) or another CJK font
2. 将字体文件保存为 `data/wenquanyi.ttf`<br>
   Save the font file as `data/wenquanyi.ttf`
3. 重新生成游戏 bundle（删除 `jsdos_cache/` 目录后重启）<br>
   Regenerate game bundles (delete `jsdos_cache/` directory and restart)

> 没有字体文件时，DOSBox-X 会使用 DBCS 位图字体作为后备方案。许多中文 DOS 游戏使用图形方式渲染文字，即使没有 TTF 字体也能正常显示。
>
> Without a TTF font, DOSBox-X falls back to DBCS bitmap rendering. Many Chinese DOS games render text graphically, so they display correctly even without a TTF font.

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
│   ├── save_service.py          #   存档管理 · Save state management
│   ├── upload_service.py        #   上传处理 · Upload processing
│   ├── scanner_service.py       #   后台扫描 · Background scanner
│   └── metadata_service.py      #   Wikipedia 搜索 · Wikipedia metadata search
│
├── shared/                      # 公共工具 · Shared utilities
│   ├── game_util.py             #   ZIP 检查/可执行文件检测 · ZIP inspection / executable detection
│   └── dosbox_conf.py           #   DOSBox 配置生成 · DOSBox config generation
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
│   ├── css/main.css             #   主样式 · Main stylesheet (dark theme)
│   ├── js/
│   │   ├── app.js               #   全局脚本 · Global (auth state, nav, toasts)
│   │   ├── game.js              #   js-dos 播放器 · js-dos player integration
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
  → 读取 .jsdos/dosbox.conf
  → 挂载 IDBFS 持久化层 (如果存在历史存档则自动恢复)
  → DOSBox-X 启动 → autoexec 运行游戏主程序
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
  → Reads .jsdos/dosbox.conf
  → Mounts IDBFS persistence layer (auto-restores if prior save exists)
  → DOSBox-X boots → autoexec launches game executable
  → Game renders on <canvas>
  → onEvent('ci-ready') fires → hides loading overlay → game is playable
```

---

## DOSBox 配置模板 · DOSBox Config Template

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
│ 1. DOSBox-X 虚拟文件系统 (Emscripten MEMFS)     │
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
- ✅ **多设备独立 · Per-Device**: 每个浏览器/设备有独立的存档，不会同步
  - Each browser/device has independent saves, no cloud sync

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
| `onEvent: 'ci-ready'` | 游戏加载完成回调 · Game ready callback |
| `autoSave: true` | 启用自动保存 · Enable auto-save |

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
| DOS 模拟 · DOS Emulation | [js-dos v8](https://js-dos.com/) via jsDelivr CDN |
| DOSBox 后端 · DOSBox Backend | DOSBox-X (CJK TTF + DBCS support) |
| 元数据 · Metadata | Wikipedia API |
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
