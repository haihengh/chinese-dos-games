# Release Process

This document describes how to create and publish a new release of Chinese DOS Games Web.

## Prerequisites

- Docker + Docker Hub account with `haihengh/chinese-dos-games` repository created
- GitHub repo with write access and `GHCR` enabled (Settings → Packages)
- GitHub CLI (`gh`) installed and authenticated (`gh auth login`)
- Git tags pushed to origin

### One-time Setup

```bash
# 1. Login to Docker Hub
docker login

# 2. Login to GitHub Container Registry
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

# 3. Create multi-arch builder
docker buildx create --name multiarch --use

# 4. Authenticate GitHub CLI
gh auth login
```

## Quick Release

```bash
# 1. Bump version
export VERSION=1.0.0

# 2. Tag and push
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

# 3. Build and push Docker image
./release.sh $VERSION
```

The script handles:
- Building the Docker image for `linux/amd64` and `linux/arm64`
- Tagging with `latest` and version
- Pushing to Docker Hub and GitHub Container Registry
- Creating a GitHub Release with auto-generated notes

## Manual Steps

### 1. Tag the release

```bash
git tag -a "v1.0.0" -m "Release v1.0.0"
git push origin "v1.0.0"
```

### 2. Build multi-arch Docker image

```bash
# Create buildx builder (one-time)
docker buildx create --name multiarch --use

# Build + push
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag ghcr.io/haihengh/chinese-dos-games:latest \
    --tag ghcr.io/haihengh/chinese-dos-games:v1.0.0 \
    --tag haihengh/chinese-dos-games:latest \
    --tag haihengh/chinese-dos-games:v1.0.0 \
    --push \
    .
```

### 3. Create GitHub Release

Go to: https://github.com/haihengh/chinese-dos-games/releases/new

- Tag: `v1.0.0`
- Title: `v1.0.0 — <brief description>`
- Body: Copy from CHANGELOG.md for this version
- Attach: `start.bat`, `start.sh`

### 4. Update Docker Hub description

```bash
docker pushrm haihengh/chinese-dos-games
```

## Docker Repositories

| Registry | Image |
|----------|-------|
| Docker Hub | `haihengh/chinese-dos-games` |
| GitHub Container Registry | `ghcr.io/haihengh/chinese-dos-games` |

## User Installation Commands

### Docker (recommended)
```bash
# Pull and run
docker run -d -p 5000:5000 \
    -v dos-games-bin:/app/bin \
    -v dos-games-cache:/app/web/jsdos_cache \
    -e ANTHROPIC_API_KEY=sk-ant-... \
    --name dos-games \
    haihengh/chinese-dos-games:latest

# Or with docker-compose
curl -O https://raw.githubusercontent.com/haihengh/chinese-dos-games/master/docker-compose.yml
docker compose up -d
```

### Windows (native)
```batch
# Download and double-click
start.bat
```

### Mac / Linux (native)
```bash
chmod +x start.sh
./start.sh
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | — | AI chat (Claude) |
| `GAME_DOWNLOAD_BASE` | No | GitHub raw | Game mirror URL (use ghproxy for China) |
| `SECRET_KEY` | No | auto-gen | Flask session secret |
| `PORT` | No | 5000 | Server port |

## Post-Release Checklist

- [ ] Docker Hub: verify `latest` and `vX.Y.Z` tags are listed
- [ ] GHCR: verify packages at `https://github.com/haihengh/chinese-dos-games/pkgs/container/chinese-dos-games`
- [ ] GitHub Release: publish the draft at `https://github.com/haihengh/chinese-dos-games/releases`
- [ ] Test pull: `docker pull haihengh/chinese-dos-games:latest`
- [ ] Test run: `docker run --rm -p 5000:5000 haihengh/chinese-dos-games:latest`
- [ ] Test game-on-demand: open browser, click any game, verify auto-download
- [ ] Update `dos.lol` deployment (if applicable)

## China Mirror Setup

Set `GAME_DOWNLOAD_BASE` to a China-accessible mirror:

```bash
# Option 1: GitHub proxy
export GAME_DOWNLOAD_BASE=https://ghproxy.net/https://raw.githubusercontent.com/haihengh/chinese-dos-games/refs/heads/master/bin/

# Option 2: Self-hosted
export GAME_DOWNLOAD_BASE=https://my-cdn.example.com/games/
```
