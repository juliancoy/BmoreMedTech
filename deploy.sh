#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0

MEDTECH_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options]

Deploys Baltimore MedTech at medtech.social.

This repository does not deploy OrgPortal or CodeCollective. Shared portal
changes must be deployed from the CodeCollective repository.

Options:
  --dry-run                 Build and validate deploy commands without publishing
  -h, --help                Show this help

Examples:
  ./deploy.sh
  ./deploy.sh --dry-run
EOF
}

while (($#)); do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      MEDTECH_ARGS+=("--dry-run")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[deploy] unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v npm >/dev/null 2>&1; then
  echo "[deploy] npm not found; install Node.js/npm first" >&2
  exit 1
fi

echo "[deploy][medtech] installing dependencies"
npm ci

echo "[deploy][medtech] building and deploying medtech.social"
npm run build
npx wrangler deploy "${MEDTECH_ARGS[@]}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[deploy] complete (dry-run)"
else
  echo "[deploy] complete"
fi
