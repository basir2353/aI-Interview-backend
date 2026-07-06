#!/bin/sh
set -e

mkdir -p /app/models /app/uploads

STT_PROVIDER="${STT_PROVIDER:-local}"
MODEL_PATH="${WHISPER_MODEL_PATH:-/app/models/ggml-base.bin}"

download_model() {
  url="$1"
  dest="$2"
  tmp="${dest}.part"
  rm -f "$tmp"
  # Resume partial downloads; HTTP/1.1 avoids curl HTTP/2 cancel errors on HuggingFace.
  curl --http1.1 --retry 10 --retry-delay 8 --retry-all-errors \
    --connect-timeout 30 --max-time 1800 -C - \
    -fsSL "$url" -o "$tmp" && mv "$tmp" "$dest"
}

if [ "$STT_PROVIDER" = "local" ] && [ ! -s "$MODEL_PATH" ]; then
  echo "[entrypoint] STT_PROVIDER=local but model missing at $MODEL_PATH"
  echo "[entrypoint] Downloading ggml-base.bin (multilingual, ~150MB)..."
  if download_model \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" \
    "$MODEL_PATH"; then
    echo "[entrypoint] Whisper model ready at $MODEL_PATH"
  else
    echo "[entrypoint] WARN: Could not download whisper model."
    echo "[entrypoint] Set STT_PROVIDER=speaches with SPEACHES_BASE_URL + SPEACHES_API_KEY on Railway,"
    echo "[entrypoint] or STT_PROVIDER=openai with OPENAI_API_KEY. Local STT will fail until a model exists."
  fi
fi

exec node dist/index.js
