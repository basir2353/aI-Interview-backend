# ── Stage 1: build whisper.cpp CLI ──────────────────────────────────────────
FROM node:20-bookworm AS whisper-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /whisper
RUN git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git . \
    && cmake -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --config Release -j"$(nproc)"

# ── Stage 2: build Node app ───────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npm run build

# ── Stage 3: production runtime ─────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV WHISPER_CPP_PATH=/usr/local/bin/whisper-cli
ENV WHISPER_MODEL_PATH=/app/models/ggml-base.en.bin

COPY --from=whisper-builder /whisper/build/bin/whisper-cli /usr/local/bin/whisper-cli

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/models /app/uploads \
    && curl -fsSL -o /app/models/ggml-base.en.bin \
      https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
