#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}"
SELENIUM_IMAGE="${SELENIUM_IMAGE:-selenium/standalone-chrome:latest}"
SITE_CONTAINER_NAME="${SITE_CONTAINER_NAME:-bmoremedtech-local-site}"
SITE_PORT="${SITE_PORT:-8768}"
SELENIUM_CONTAINER_NAME="${SELENIUM_CONTAINER_NAME:-codecollective-datacenters-selenium}"
SELENIUM_PORT="${SELENIUM_PORT:-4444}"
SELENIUM_URL="${SELENIUM_URL:-http://127.0.0.1:${SELENIUM_PORT}/wd/hub}"
DEFAULT_LOCAL_BASE_URL="https://host.docker.internal:${SITE_PORT}"
CONFIGURED_BASE_URL="${BMORE_MEDTECH_BASE_URL:-}"
BMORE_MEDTECH_BASE_URL="${CONFIGURED_BASE_URL:-$DEFAULT_LOCAL_BASE_URL}"
BMORE_MEDTECH_SCREENSHOT_DIR="${BMORE_MEDTECH_SCREENSHOT_DIR:-/tmp/bmore-medtech-selenium-regression}"
CERT_DIR="${CERT_DIR:-$ROOT_DIR/.local/certs}"
STARTED_SITE=0
STARTED_SELENIUM=0

cleanup() {
  if [[ "${STARTED_SITE}" == "1" && "${KEEP_BMORE_MEDTECH_SITE:-0}" != "1" ]]; then
    docker rm -f "$SITE_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if [[ "${STARTED_SELENIUM}" == "1" ]]; then
    docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

port_is_open() {
  python3 - "$1" <<'PY' >/dev/null 2>&1
import socket
import sys

sock = socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=1)
sock.close()
PY
}

wait_for_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 80); do
    if python3 - "$url" <<'PY' >/dev/null 2>&1
import ssl
import sys
import urllib.request

context = ssl._create_unverified_context()
with urllib.request.urlopen(sys.argv[1], timeout=2, context=context) as response:
    if response.status >= 400:
        raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done
  echo "[bmore-medtech-selenium] timed out waiting for $label at $url" >&2
  return 1
}

wait_for_selenium() {
  local status_url="http://127.0.0.1:${SELENIUM_PORT}/status"
  for _ in $(seq 1 80); do
    if python3 - "$status_url" <<'PY' >/dev/null 2>&1
import json
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
    payload = json.loads(response.read().decode("utf-8"))
value = payload.get("value", {})
nodes = value.get("nodes") or []
has_up_node = any(node.get("availability") == "UP" for node in nodes)
if not (value.get("ready") or has_up_node):
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done
  echo "[bmore-medtech-selenium] timed out waiting for Selenium at $SELENIUM_URL" >&2
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "[bmore-medtech-selenium] docker not found; install Docker first" >&2
  exit 1
fi

if [[ -z "$CONFIGURED_BASE_URL" ]]; then
  npm --prefix "$ROOT_DIR" run build

  mkdir -p "$CERT_DIR"
  if [[ ! -f "$CERT_DIR/localhost.crt" || ! -f "$CERT_DIR/localhost.key" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout "$CERT_DIR/localhost.key" \
      -out "$CERT_DIR/localhost.crt" \
      -subj "/CN=localhost" \
      -addext "subjectAltName=DNS:localhost,DNS:host.docker.internal,IP:127.0.0.1,IP:::1" >/dev/null 2>&1
  fi

  docker rm -f "$SITE_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$SITE_CONTAINER_NAME" \
    --add-host=host.docker.internal:host-gateway \
    -e SITE_ROOT=/site \
    -e CONTAINER_PORT=8080 \
    -e TLS_CERT_FILE=/certs/localhost.crt \
    -e TLS_KEY_FILE=/certs/localhost.key \
    -p "${SITE_PORT}:8080" \
    -v "$ROOT_DIR/dist:/site:ro" \
    -v "$ROOT_DIR/scripts/local-static-server.mjs:/server.mjs:ro" \
    -v "$CERT_DIR:/certs:ro" \
    "$NODE_IMAGE" node /server.mjs >/dev/null
  STARTED_SITE=1
  wait_for_http "https://127.0.0.1:${SITE_PORT}/" "Baltimore MedTech local site"
fi

if ! port_is_open "$SELENIUM_PORT"; then
  docker rm -f "$SELENIUM_CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d \
    --name "$SELENIUM_CONTAINER_NAME" \
    --shm-size=2g \
    --add-host=host.docker.internal:host-gateway \
    -e SE_NODE_MAX_SESSIONS=1 \
    -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
    -p "${SELENIUM_PORT}:4444" \
    "$SELENIUM_IMAGE" >/dev/null
  STARTED_SELENIUM=1
fi

wait_for_selenium

echo "[bmore-medtech-selenium] base url: ${BMORE_MEDTECH_BASE_URL}"
echo "[bmore-medtech-selenium] screenshots: ${BMORE_MEDTECH_SCREENSHOT_DIR}"
SELENIUM_URL="$SELENIUM_URL" \
BMORE_MEDTECH_BASE_URL="$BMORE_MEDTECH_BASE_URL" \
BMORE_MEDTECH_SCREENSHOT_DIR="$BMORE_MEDTECH_SCREENSHOT_DIR" \
  python3 "$ROOT_DIR/scripts/selenium-regression.py"
