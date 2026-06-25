# ─── Chinese DOS Games Web — Dockerfile ───
# Multi-stage: build layer for deps, slim runtime

FROM python:3.11-slim AS builder
WORKDIR /build
COPY web/requirements.txt .
RUN pip install --no-cache-dir --target=/install -r requirements.txt

FROM python:3.11-slim
LABEL org.opencontainers.image.title="Chinese DOS Games Web"
LABEL org.opencontainers.image.description="Play 1898+ Chinese DOS games in your browser"
LABEL org.opencontainers.image.source="https://github.com/haihengh/chinese-dos-games"
LABEL org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python path
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="/install"

# Copy installed packages from builder
COPY --from=builder /install /install

# Copy app code
COPY web/ /app/web/
COPY games.json /app/games.json
COPY img/ /app/img/

# Generate persistent self-signed SSL certificate (10-year validity)
RUN PYTHONPATH=/install python /app/web/generate_cert.py --output /app/web/certs

# Game files fetched on demand at runtime — create empty dirs
RUN mkdir -p /app/web/jsdos_cache /app/web/uploads_temp /app/bin /app/img \
    && chmod 777 /app/bin /app/img /app/web/jsdos_cache /app/web/uploads_temp

# Security: drop root — but keep cert readable
RUN useradd -m -s /bin/bash dosgames \
    && chown -R dosgames:dosgames /app \
    && chmod 600 /app/web/certs/key.pem
USER dosgames

WORKDIR /app/web
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -skf https://localhost:5000/api/ai/status || exit 1

# Start with SSL for mic support
CMD ["python", "app.py", "--ssl"]
