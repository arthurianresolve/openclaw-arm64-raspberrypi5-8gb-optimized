#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE=""
INSTALL_ROOT="${OPENCLAW_PI_INSTALL_ROOT:-/data/openclaw}"
GATEWAY_CACHE_ROOT=""
QMD_STATE_ROOT=""
ENABLE_QMD_SERVICE=0
ENABLE_LINGER=0
FORCE=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-raspberry-pi-system.sh [options]

Creates Raspberry Pi / ARM64-friendly defaults for the OpenClaw gateway service
and, optionally, the repo-managed QMD wrapper/service.

Options:
  --install-root PATH        Base SSD-backed root (default: /data/openclaw)
  --gateway-cache-root PATH  Override NODE_COMPILE_CACHE path
  --qmd-state-root PATH      Override QMD wrapper state root
  --profile NAME             Gateway profile name for openclaw-gateway-<profile>.service
  --enable-qmd-service       Also install/enable the QMD wrapper + qmd-mcp.service
  --enable-linger            Run `loginctl enable-linger $USER`
  --force                    Overwrite any existing Raspberry Pi gateway drop-in
  -h, --help                 Show this message
EOF
}

resolve_gateway_service_name() {
  if [ -z "$PROFILE" ] || [ "$PROFILE" = "default" ]; then
    printf '%s\n' "openclaw-gateway"
    return
  fi
  printf 'openclaw-gateway-%s\n' "$PROFILE"
}

can_use_user_systemd() {
  systemctl --user show-environment >/dev/null 2>&1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --install-root)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--install-root requires a path argument" >&2
        exit 1
      fi
      INSTALL_ROOT="$2"
      shift
      ;;
    --gateway-cache-root)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--gateway-cache-root requires a path argument" >&2
        exit 1
      fi
      GATEWAY_CACHE_ROOT="$2"
      shift
      ;;
    --qmd-state-root)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--qmd-state-root requires a path argument" >&2
        exit 1
      fi
      QMD_STATE_ROOT="$2"
      shift
      ;;
    --profile)
      if [ $# -lt 2 ]; then
        printf '%s\n' "--profile requires a profile name" >&2
        exit 1
      fi
      PROFILE="$2"
      shift
      ;;
    --enable-qmd-service)
      ENABLE_QMD_SERVICE=1
      ;;
    --enable-linger)
      ENABLE_LINGER=1
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

if [ -z "$GATEWAY_CACHE_ROOT" ]; then
  GATEWAY_CACHE_ROOT="$INSTALL_ROOT/cache/node-compile"
fi

if [ -z "$QMD_STATE_ROOT" ]; then
  QMD_STATE_ROOT="$INSTALL_ROOT/state/qmd-home"
fi

SERVICE_NAME="$(resolve_gateway_service_name)"
DROPIN_DIR="$HOME/.config/systemd/user/${SERVICE_NAME}.service.d"
DROPIN_PATH="$DROPIN_DIR/raspberry-pi.conf"

mkdir -p "$DROPIN_DIR" "$GATEWAY_CACHE_ROOT" "$QMD_STATE_ROOT"

if [ -e "$DROPIN_PATH" ] && [ "$FORCE" -ne 1 ]; then
  backup_path="$DROPIN_PATH.backup.$(date +%Y%m%d%H%M%S)"
  mv "$DROPIN_PATH" "$backup_path"
  printf '%s\n' "Backed up existing $DROPIN_PATH to $backup_path"
fi

cat >"$DROPIN_PATH" <<EOF
[Service]
Environment=OPENCLAW_NO_RESPAWN=1
Environment=NODE_COMPILE_CACHE=$GATEWAY_CACHE_ROOT
Environment=QMD_WRAPPER_HOME=$QMD_STATE_ROOT
Restart=always
RestartSec=2
TimeoutStartSec=90
EOF

printf '%s\n' "Installed gateway drop-in: $DROPIN_PATH"
printf '%s\n' "Gateway service:         ${SERVICE_NAME}.service"
printf '%s\n' "Compile cache root:      $GATEWAY_CACHE_ROOT"
printf '%s\n' "QMD state root:          $QMD_STATE_ROOT"

if command -v systemctl >/dev/null 2>&1 && can_use_user_systemd; then
  systemctl --user daemon-reload
fi

if [ "$ENABLE_QMD_SERVICE" -eq 1 ]; then
  qmd_args=(--state-root "$QMD_STATE_ROOT" --enable-service)
  if [ "$ENABLE_LINGER" -eq 1 ]; then
    qmd_args+=(--enable-linger)
  fi
  if [ "$FORCE" -eq 1 ]; then
    qmd_args+=(--force)
  fi
  "$SCRIPT_DIR/setup-qmd-system.sh" "${qmd_args[@]}"
elif [ "$ENABLE_LINGER" -eq 1 ] && command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$USER"
fi

cat <<EOF

Next steps:
  1. Install or refresh the gateway service:
     openclaw gateway install --force
  2. Restart the gateway service:
     systemctl --user restart ${SERVICE_NAME}.service
  3. Verify the service env:
     systemctl --user status ${SERVICE_NAME}.service
EOF
