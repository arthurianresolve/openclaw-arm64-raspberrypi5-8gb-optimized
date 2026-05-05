#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFRESH_TEMPLATE="$SCRIPT_DIR/codesight/openclaw-codesight-refresh.template.sh"
SERVICE_TEMPLATE="$SCRIPT_DIR/codesight/openclaw-codesight-refresh.service.template"
TIMER_TEMPLATE="$SCRIPT_DIR/codesight/openclaw-codesight-refresh.timer"

TARGET_BIN_DIR="${OPENCLAW_CODESIGHT_BIN_DIR:-$HOME/.local/bin}"
TARGET_BIN="$TARGET_BIN_DIR/openclaw-codesight-refresh"
TARGET_SERVICE_DIR="$HOME/.config/systemd/user"
TARGET_SERVICE="$TARGET_SERVICE_DIR/openclaw-codesight-refresh.service"
TARGET_TIMER="$TARGET_SERVICE_DIR/openclaw-codesight-refresh.timer"
DEFAULT_WORKSPACE="$HOME/excaliclaw"
WORKSPACE_DIR="${OPENCLAW_CODESIGHT_WORKSPACE:-$DEFAULT_WORKSPACE}"
STATE_DIR="${OPENCLAW_CODESIGHT_STATE_DIR:-$HOME/.local/state/openclaw-codesight}"
ENABLE_TIMER=0
ENABLE_LINGER=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-codesight-refresh-system.sh [options]

Installs a low-priority systemd user timer for out-of-band Codesight refresh.

Options:
  --workspace PATH  Workspace to refresh (default: ~/excaliclaw)
  --enable-timer    Enable and start openclaw-codesight-refresh.timer
  --enable-linger   Run `loginctl enable-linger $USER`
  -h, --help        Show this message
EOF
}

can_use_user_systemd() {
  systemctl --user show-environment >/dev/null 2>&1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --workspace)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--workspace requires a path argument" >&2
        exit 1
      fi
      WORKSPACE_DIR="$2"
      shift
      ;;
    --enable-timer)
      ENABLE_TIMER=1
      ;;
    --enable-linger)
      ENABLE_LINGER=1
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

mkdir -p "$TARGET_BIN_DIR" "$TARGET_SERVICE_DIR" "$STATE_DIR"

cp "$REFRESH_TEMPLATE" "$TARGET_BIN"
chmod +x "$TARGET_BIN"
sed \
  -e "s#__OPENCLAW_CODESIGHT_REFRESH_BIN__#$TARGET_BIN#g" \
  -e "s#__OPENCLAW_CODESIGHT_WORKSPACE__#$WORKSPACE_DIR#g" \
  -e "s#__OPENCLAW_CODESIGHT_STATE_DIR__#$STATE_DIR#g" \
  "$SERVICE_TEMPLATE" >"$TARGET_SERVICE"
cp "$TIMER_TEMPLATE" "$TARGET_TIMER"

printf '%s\n' "Installed refresh script: $TARGET_BIN"
printf '%s\n' "Installed service:        $TARGET_SERVICE"
printf '%s\n' "Installed timer:          $TARGET_TIMER"
printf '%s\n' "Workspace:                $WORKSPACE_DIR"

if command -v systemctl >/dev/null 2>&1 && can_use_user_systemd; then
  systemctl --user daemon-reload
  if [ "$ENABLE_TIMER" -eq 1 ]; then
    systemctl --user enable --now openclaw-codesight-refresh.timer
  fi
fi

if [ "$ENABLE_LINGER" -eq 1 ] && command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER"
fi

cat <<EOF

Next steps:
  1. Verify a manual run:
     $TARGET_BIN
  2. If enabled, check timer state:
     systemctl --user status openclaw-codesight-refresh.timer
  3. Inspect refresh logs:
     tail -n 200 $STATE_DIR/refresh.log
EOF

