#!/bin/sh
set -eu

REAL_QMD_BIN="__REAL_QMD_BIN__"
DEFAULT_QMD_WRAPPER_HOME="__DEFAULT_QMD_WRAPPER_HOME__"

if [ ! -x "$REAL_QMD_BIN" ]; then
  printf '%s\n' "openclaw-qmd: real QMD binary not found at $REAL_QMD_BIN" >&2
  exit 1
fi

REAL_HOME="${HOME:-/tmp}"
QMD_WRAPPER_HOME="${QMD_WRAPPER_HOME:-$DEFAULT_QMD_WRAPPER_HOME}"
LEGACY_QMD_CONFIG_DIR="$REAL_HOME/.config/qmd"
LEGACY_QMD_CACHE_DIR="$REAL_HOME/.cache/qmd"

if [ -z "${XDG_CACHE_HOME:-}" ]; then
  export XDG_CACHE_HOME="$QMD_WRAPPER_HOME/.cache"
fi

if [ -z "${XDG_CONFIG_HOME:-}" ]; then
  export XDG_CONFIG_HOME="$QMD_WRAPPER_HOME/.config"
fi

QMD_CACHE_DIR="$XDG_CACHE_HOME/qmd"
QMD_CONFIG_DIR="$XDG_CONFIG_HOME/qmd"
QMD_MODELS_DIR="$QMD_CACHE_DIR/models"
TARGET_QMD_DB="$QMD_CACHE_DIR/index.sqlite"

mkdir -p "$QMD_CACHE_DIR" "$XDG_CONFIG_HOME"

if [ ! -e "$QMD_CONFIG_DIR" ] && [ -d "$LEGACY_QMD_CONFIG_DIR" ]; then
  ln -s "$LEGACY_QMD_CONFIG_DIR" "$QMD_CONFIG_DIR"
fi

if [ ! -e "$TARGET_QMD_DB" ] && [ -r "$LEGACY_QMD_CACHE_DIR/index.sqlite" ]; then
  cp "$LEGACY_QMD_CACHE_DIR/index.sqlite" "$TARGET_QMD_DB"
fi

if [ ! -e "$QMD_MODELS_DIR" ] && [ -d "$LEGACY_QMD_CACHE_DIR/models" ]; then
  ln -s "$LEGACY_QMD_CACHE_DIR/models" "$QMD_MODELS_DIR"
fi

if [ -z "${NODE_LLAMA_CPP_GPU:-}" ]; then
  export NODE_LLAMA_CPP_GPU=false
fi

if [ -z "${QMD_LLAMA_GPU:-}" ]; then
  export QMD_LLAMA_GPU=none
fi

if [ "${1:-}" = "query" ] && [ -z "${QMD_DEFAULT_QUERY_MODE:-}" ]; then
  qmd_has_no_rerank=0
  for qmd_arg in "$@"; do
    if [ "$qmd_arg" = "--no-rerank" ]; then
      qmd_has_no_rerank=1
      break
    fi
  done
  if [ "$qmd_has_no_rerank" -eq 0 ]; then
    set -- "$@" --no-rerank
  fi
fi

exec "$REAL_QMD_BIN" "$@"
