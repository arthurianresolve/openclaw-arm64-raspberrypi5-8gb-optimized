#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/docker-build.sh"
IMAGE_NAME="${OPENCLAW_INSTALL_E2E_IMAGE:-openclaw-install-e2e:local}"
INSTALL_URL="${OPENCLAW_INSTALL_URL:-https://openclaw.bot/install.sh}"
INSTALL_PACKAGE_TGZ="${OPENCLAW_INSTALL_PACKAGE_TGZ:-}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_API_TOKEN="${ANTHROPIC_API_TOKEN:-}"
OPENCLAW_E2E_MODELS="${OPENCLAW_E2E_MODELS:-}"
DOCKER_TGZ_ARGS=()
CONTAINER_PACKAGE_TGZ=""

if [[ -n "$INSTALL_PACKAGE_TGZ" ]]; then
  INSTALL_PACKAGE_TGZ="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$INSTALL_PACKAGE_TGZ")"
  if [[ ! -f "$INSTALL_PACKAGE_TGZ" ]]; then
    echo "OPENCLAW_INSTALL_PACKAGE_TGZ does not exist: $INSTALL_PACKAGE_TGZ" >&2
    exit 1
  fi
  CONTAINER_PACKAGE_TGZ="/tmp/openclaw-install-e2e-candidate.tgz"
  DOCKER_TGZ_ARGS=(-v "$INSTALL_PACKAGE_TGZ:$CONTAINER_PACKAGE_TGZ:ro")
fi

echo "==> Build image: $IMAGE_NAME"
docker_build_run install-e2e-build \
  -t "$IMAGE_NAME" \
  -f "$ROOT_DIR/scripts/docker/install-sh-e2e/Dockerfile" \
  "$ROOT_DIR/scripts/docker"

echo "==> Run E2E installer test"
docker run --rm \
  "${DOCKER_TGZ_ARGS[@]}" \
  -e OPENCLAW_INSTALL_URL="$INSTALL_URL" \
  -e OPENCLAW_INSTALL_TAG="${OPENCLAW_INSTALL_TAG:-latest}" \
  -e OPENCLAW_INSTALL_PACKAGE_TGZ="$CONTAINER_PACKAGE_TGZ" \
  -e OPENCLAW_E2E_MODELS="$OPENCLAW_E2E_MODELS" \
  -e OPENCLAW_INSTALL_E2E_PREVIOUS="${OPENCLAW_INSTALL_E2E_PREVIOUS:-}" \
  -e OPENCLAW_INSTALL_E2E_SKIP_PREVIOUS="${OPENCLAW_INSTALL_E2E_SKIP_PREVIOUS:-0}" \
  -e OPENCLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS="${OPENCLAW_INSTALL_E2E_AGENT_TURN_TIMEOUT_SECONDS:-600}" \
  -e OPENCLAW_NO_ONBOARD=1 \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  -e ANTHROPIC_API_TOKEN \
  "$IMAGE_NAME"
