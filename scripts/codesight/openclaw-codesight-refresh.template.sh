#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${OPENCLAW_CODESIGHT_WORKSPACE:-$HOME/excaliclaw}"
STATE_DIR="${OPENCLAW_CODESIGHT_STATE_DIR:-$HOME/.local/state/openclaw-codesight}"
LOG_FILE="${OPENCLAW_CODESIGHT_LOG_FILE:-$STATE_DIR/refresh.log}"

mkdir -p "$STATE_DIR"
touch "$LOG_FILE"

if [ ! -d "$WORKSPACE_DIR" ]; then
  printf '%s\n' "[codesight-refresh] workspace missing: $WORKSPACE_DIR" >>"$LOG_FILE"
  exit 0
fi

run_codesight() {
  if command -v codesight >/dev/null 2>&1; then
    codesight "$@"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    npx --yes codesight "$@"
    return 0
  fi
  return 1
}

{
  printf '\n[%s] refresh start\n' "$(date --iso-8601=seconds)"
  cd "$WORKSPACE_DIR"
  run_codesight --wiki
  run_codesight --mode knowledge .
  printf '[%s] refresh ok\n' "$(date --iso-8601=seconds)"
} >>"$LOG_FILE" 2>&1 || {
  printf '[%s] refresh failed\n' "$(date --iso-8601=seconds)" >>"$LOG_FILE"
  exit 1
}

