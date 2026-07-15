#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
MODEL_PATH="${WHISPER_MODEL_PATH:-$ROOT_DIR/.local-models/ggml-small.en.bin}"
if [[ "$MODEL_PATH" != /* ]]; then
  MODEL_PATH="$ROOT_DIR/$MODEL_PATH"
fi
TEMP_DIR="${TMPDIR:-/tmp}/muaythai-memory-whisper"
mkdir -p "$TEMP_DIR"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server is not installed. Run: npm run whisper:setup" >&2
  exit 1
fi

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Whisper model not found at $MODEL_PATH. Run: npm run whisper:setup" >&2
  exit 1
fi

exec whisper-server \
  --model "$MODEL_PATH" \
  --host 127.0.0.1 \
  --port 8080 \
  --tmp-dir "$TEMP_DIR" \
  --convert
