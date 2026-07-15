#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install local Whisper." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  brew install ffmpeg
fi

if ! command -v whisper-server >/dev/null 2>&1; then
  brew install whisper-cpp
fi

MODEL_DIR="$ROOT_DIR/.local-models"
MODEL_PATH="${WHISPER_MODEL_PATH:-$MODEL_DIR/ggml-small.en.bin}"
if [[ "$MODEL_PATH" != /* ]]; then
  MODEL_PATH="$ROOT_DIR/$MODEL_PATH"
fi
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"
MODEL_MIN_BYTES=450000000
mkdir -p "$(dirname "$MODEL_PATH")"

MODEL_BYTES=0
if [[ -f "$MODEL_PATH" ]]; then
  MODEL_BYTES="$(stat -f%z "$MODEL_PATH")"
fi

if (( MODEL_BYTES < MODEL_MIN_BYTES )); then
  echo "Downloading Whisper small.en model (about 466 MB)..."
  curl --fail --location --retry 3 --continue-at - "$MODEL_URL" --output "$MODEL_PATH"
fi

MODEL_BYTES="$(stat -f%z "$MODEL_PATH")"
if (( MODEL_BYTES < MODEL_MIN_BYTES )); then
  echo "Whisper model download is incomplete. Run npm run whisper:setup again." >&2
  exit 1
fi

echo "Local Whisper is ready."
echo "Start it in a second terminal with: npm run whisper:serve"
