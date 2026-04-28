#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_TEMPLATE="$SCRIPT_DIR/qmd/openclaw-qmd.template.sh"
SERVICE_TEMPLATE="$SCRIPT_DIR/qmd/qmd-mcp.service"
TARGET_BIN_DIR="${OPENCLAW_QMD_BIN_DIR:-$HOME/.local/bin}"
TARGET_BIN="$TARGET_BIN_DIR/qmd"
TARGET_SERVICE_DIR="$HOME/.config/systemd/user"
TARGET_SERVICE="$TARGET_SERVICE_DIR/qmd-mcp.service"
DEFAULT_STATE_ROOT="$HOME/.local/state/qmd-home"
STATE_ROOT="${OPENCLAW_QMD_STATE_ROOT:-$DEFAULT_STATE_ROOT}"
ENABLE_SERVICE=0
ENABLE_LINGER=0
PREWARM=0
FORCE=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-qmd-system.sh [options]

Installs the OpenClaw QMD wrapper and optional systemd user service for
CPU-first ARM64 / Raspberry Pi hosts.

Options:
  --enable-service   Enable and start qmd-mcp.service after install
  --enable-linger    Run `loginctl enable-linger $USER` after install
  --prewarm          Run a small `qmd query` after install to hydrate models
  --state-root PATH  Set the default QMD wrapper state root (default: ~/.local/state/qmd-home)
  --force            Overwrite an existing ~/.local/bin/qmd without a backup
  -h, --help         Show this message
EOF
}

find_real_qmd() {
  local path_dir candidate
  IFS=':' read -r -a path_parts <<<"${PATH:-}"
  for path_dir in "${path_parts[@]}"; do
    [ -n "$path_dir" ] || continue
    candidate="$path_dir/qmd"
    [ -x "$candidate" ] || continue
    if [ "$candidate" = "$TARGET_BIN" ]; then
      continue
    fi
    printf '%s\n' "$candidate"
    return 0
  done
  return 1
}

can_use_user_systemd() {
  systemctl --user show-environment >/dev/null 2>&1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --enable-service)
      ENABLE_SERVICE=1
      ;;
    --enable-linger)
      ENABLE_LINGER=1
      ;;
    --prewarm)
      PREWARM=1
      ;;
    --state-root)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--state-root requires a path argument" >&2
        exit 1
      fi
      STATE_ROOT="$2"
      shift
      ;;
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '%s\n' "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -z "$STATE_ROOT" ]; then
  printf '%s\n' "State root must not be empty" >&2
  exit 1
fi

REAL_QMD_BIN="$(find_real_qmd || true)"
if [ -z "$REAL_QMD_BIN" ]; then
  printf '%s\n' "No upstream qmd binary found on PATH. Install @tobilu/qmd first." >&2
  exit 1
fi

mkdir -p "$TARGET_BIN_DIR" "$TARGET_SERVICE_DIR"
mkdir -p "$STATE_ROOT"

if [ -e "$TARGET_BIN" ] && [ "$FORCE" -ne 1 ]; then
  backup_path="$TARGET_BIN.openclaw-backup.$(date +%Y%m%d%H%M%S)"
  mv "$TARGET_BIN" "$backup_path"
  printf '%s\n' "Backed up existing $TARGET_BIN to $backup_path"
fi

sed \
  -e "s#__REAL_QMD_BIN__#$REAL_QMD_BIN#g" \
  -e "s#__DEFAULT_QMD_WRAPPER_HOME__#$STATE_ROOT#g" \
  "$WRAPPER_TEMPLATE" >"$TARGET_BIN"
chmod +x "$TARGET_BIN"
sed "s#__QMD_WRAPPER_HOME__#$STATE_ROOT#g" "$SERVICE_TEMPLATE" >"$TARGET_SERVICE"

printf '%s\n' "Installed wrapper: $TARGET_BIN"
printf '%s\n' "Real QMD binary:   $REAL_QMD_BIN"
printf '%s\n' "Installed service: $TARGET_SERVICE"
printf '%s\n' "QMD state root:    $STATE_ROOT"

if command -v systemctl >/dev/null 2>&1 && can_use_user_systemd; then
  systemctl --user daemon-reload
  if [ "$ENABLE_SERVICE" -eq 1 ]; then
    systemctl --user enable --now qmd-mcp.service
  fi
fi

if [ "$ENABLE_LINGER" -eq 1 ] && command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER"
fi

if [ "$PREWARM" -eq 1 ]; then
  "$TARGET_BIN" query test -n 1 --json >/dev/null
fi

cat <<EOF

Next steps:
  1. Ensure $TARGET_BIN_DIR appears before npm/bun global bins on PATH.
  2. Run 'qmd status' to confirm the wrapper is active.
  3. If you enabled the service, verify it with:
     systemctl --user status qmd-mcp.service
EOF
