# 🎮 中文 DOS 游戏 Web 版 · Chinese DOS Games Web

在浏览器中游玩 1,898+ 款经典中文 DOS 游戏 — 基于 js-dos v8 (DOSBox-X 后端) 驱动。

Play 1,898+ classic Chinese DOS games in your browser — powered by js-dos v8 (DOSBox-X backend).

---

## 快速开始 · Quick Start

### 云端 AI（需 API 密钥 · requires API key）
```
docker run -d -p 5000:5000 -v dos-games-bin:/app/bin haihengh/chinese-dos-games:latest
```

### 本地 AI（无需 API 密钥，完全离线 · no API key, fully offline）
```
docker compose -f docker-compose.local-ai.yml up -d
```

### 本地 AI + GPU 加速 · Local AI with GPU
```
# NVIDIA GPU（需 nvidia-container-toolkit）
docker compose -f docker-compose.local-ai.yml -f docker-compose.local-ai.gpu-nvidia.yml up -d

# AMD / Intel Arc GPU（Linux，ROCm / OpenCL）
docker compose -f docker-compose.local-ai.yml -f docker-compose.local-ai.gpu-amd.yml up -d
```

### 🍎 Apple Silicon Mac（Ollama 原生运行 · native Ollama）
```
brew install ollama && ollama pull qwen3-vl:4b
docker compose -f docker-compose.local-ai.mac.yml up -d
```

打开 · Open **https://localhost:5000**（首次接受自签名证书 · accept self-signed cert once）。

---

## 功能 · Features

| 功能 · Feature | 说明 · Description |
|---------------|-------------------|
| 🎮 **1,898+ 款游戏** | 首次游玩自动下载，无需 35GB 全量下载 · auto-download on first play |
| 🤖 **AI 游戏助手 "Wawa"** | 可看见游戏画面，提供实时提示和攻略 · sees your game screen, gives real-time hints |
| 🏠 **本地 AI 模式** | Ollama + Qwen3-VL 4B，完全离线运行，支持视觉识别 · fully offline, vision-capable |
| 🎤 **语音输入** | 普通话 / 粵語 / 台灣國語 / English 四种可选 · 4 language options |
| 🔊 **神经网络 TTS** | Microsoft Edge TTS 语音播报，流式播放 · streaming neural playback |
| 💾 **双模存档** | 本地 IndexedDB + 云端服务器同步 · local + cloud sync |
| 🖥️ **4K 显示屏适配** | 自动适配高分辨率/超宽屏，最高 2.5x 缩放 · auto-scaling |
| 🐳 **Docker 一键部署** | 多架构支持 · multi-arch (amd64 + arm64) |

---

## 环境变量 · Environment Variables

| 变量 · Variable | 默认值 · Default | 说明 · Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | 云端 AI 密钥 · Cloud AI key |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-20250514` | Claude 模型 |
| `OLLAMA_BASE_URL` | — | Ollama 服务器地址，设置即启用本地 AI · enables local AI |
| `LOCAL_AI_MODEL` | `qwen3-vl:4b` | 本地 AI 模型 · Local AI model |
| `LOCAL_AI_DEFAULT` | — | 设为 `true` 默认使用本地 AI · default to local AI |
| `GAME_DOWNLOAD_BASE` | `https://dos-bin.zczc.cz/` | 游戏下载镜像地址 · Game mirror URL |
| `SECRET_KEY` | 自动生成 | Flask 会话密钥 · auto-generated |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥 · auto-generated |
| `PORT` | 5000 | 服务器端口 · Server port |

---

## 源码 · Source

https://github.com/haihengh/chinese-dos-games

## 许可证 · License

MIT — 游戏文件版权归各自原作者所有 · game files copyright their respective owners.
