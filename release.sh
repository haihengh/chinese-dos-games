#!/usr/bin/env bash
# ─── Chinese DOS Games — Release Script ───
# Usage: ./release.sh 1.0.0
# Builds multi-arch Docker image, pushes to registries, creates GitHub Release.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
    echo "Usage: ./release.sh <version>"
    echo "Example: ./release.sh 1.0.0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Docker image names ──
DOCKERHUB_IMAGE="haihengh/chinese-dos-games"
GHCR_IMAGE="ghcr.io/haihengh/chinese-dos-games"
TAG="v$VERSION"

echo "╔══════════════════════════════════════╗"
echo "║  Chinese DOS Games — Release v$VERSION  ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Verify git tag ──
echo "  [1/4] Checking git tag..."
if ! git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "  Tag $TAG not found. Create it first:"
    echo "    git tag -a \"$TAG\" -m \"Release $TAG\""
    echo "    git push origin \"$TAG\""
    exit 1
fi
echo "  ✓ Tag $TAG exists"

# ── 2. Build multi-arch Docker image ──
echo "  [2/4] Building Docker image (linux/amd64 + linux/arm64)..."

# Create buildx builder if needed
docker buildx inspect multiarch >/dev/null 2>&1 || \
    docker buildx create --name multiarch --use

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag "$DOCKERHUB_IMAGE:latest" \
    --tag "$DOCKERHUB_IMAGE:$TAG" \
    --tag "$GHCR_IMAGE:latest" \
    --tag "$GHCR_IMAGE:$TAG" \
    --push \
    .

echo "  ✓ Docker image built and pushed"

# ── 3. Verify Docker images ──
echo "  [3/4] Verifying images..."
for image in "$DOCKERHUB_IMAGE:$TAG" "$GHCR_IMAGE:$TAG"; do
    if docker buildx imagetools inspect "$image" >/dev/null 2>&1; then
        echo "  ✓ $image"
    else
        echo "  ✗ $image — may need time to propagate"
    fi
done

# ── 4. GitHub Release ──
echo "  [4/4] Creating GitHub Release..."
if command -v gh &>/dev/null; then
    # Extract changelog for this version (between version headers)
    CHANGELOG=$(sed -n '/^## \[Unreleased\]/,/^## \[/p' CHANGELOG.md | sed '1d;$d' || echo "Release $TAG")

    gh release create "$TAG" \
        --title "$TAG — Chinese DOS Games Web" \
        --notes "${CHANGELOG:-Release $TAG}" \
        --draft

    echo "  ✓ GitHub Release draft created: review and publish at"
    echo "    https://github.com/haihengh/chinese-dos-games/releases"
else
    echo "  ⚠ gh CLI not found. Create release manually:"
    echo "    https://github.com/haihengh/chinese-dos-games/releases/new?tag=$TAG"
fi

echo ""
echo "  ✅ Release v$VERSION complete!"
echo ""
echo "  User pull commands:"
echo "    docker pull $DOCKERHUB_IMAGE:latest"
echo "    docker pull $DOCKERHUB_IMAGE:$TAG"
echo "    docker pull $GHCR_IMAGE:latest"
echo ""
echo "  Quick run:"
echo "    docker run -d -p 5000:5000 -v dos-games-bin:/app/bin $DOCKERHUB_IMAGE:latest"
echo ""
