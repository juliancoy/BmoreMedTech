#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODECOLLECTIVE_DIR="${CODECOLLECTIVE_DIR:-$ROOT_DIR/../CodeCollective}"

DEPLOY_MEDTECH=1
DEPLOY_CODECOLLECTIVE=1
CODECOLLECTIVE_COMPONENT="${CODECOLLECTIVE_COMPONENT:-site}"
CODECOLLECTIVE_TARGET="${CODECOLLECTIVE_TARGET:-prod}"
DRY_RUN=0
NO_VERIFY=0
VERBOSE=0

MEDTECH_ARGS=()
CODECOLLECTIVE_ARGS=()

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [options] [-- <extra CodeCollective deploy args>]

Deploys:
  1. Baltimore MedTech at medtech.social
  2. CodeCollective main site at codecollective.us, including the embedded
     OrgPortal frontend at /p/

Options:
  --medtech-only            Deploy only MedTech
  --portal-only             Deploy only CodeCollective/OrgPortal
  --with-portal-backends    Deploy CodeCollective site, PIdP, and org Worker
                            backends. May apply remote D1 migrations.
  --portal-component VALUE  Pass a specific CodeCollective component:
                            site | org | pidp | all (default: site)
  --portal-target VALUE     CodeCollective target: prod | dev | both
                            (default: prod)
  --dry-run                 Build and validate deploy commands without publishing
  --no-verify               Skip post-deploy smoke checks where supported
  --verbose                 Print full deploy logs where supported
  -h, --help                Show this help

Environment:
  CODECOLLECTIVE_DIR        Path to the CodeCollective repo
                            (default: ../CodeCollective)

Examples:
  ./deploy.sh
  ./deploy.sh --dry-run
  ./deploy.sh --with-portal-backends
  ./deploy.sh --portal-component org
EOF
}

while (($#)); do
  case "$1" in
    --medtech-only)
      DEPLOY_CODECOLLECTIVE=0
      shift
      ;;
    --portal-only)
      DEPLOY_MEDTECH=0
      shift
      ;;
    --with-portal-backends)
      CODECOLLECTIVE_COMPONENT="all"
      shift
      ;;
    --portal-component)
      CODECOLLECTIVE_COMPONENT="${2:-}"
      shift 2
      ;;
    --portal-target)
      CODECOLLECTIVE_TARGET="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      MEDTECH_ARGS+=("--dry-run")
      CODECOLLECTIVE_ARGS+=("--dry-run")
      shift
      ;;
    --no-verify)
      NO_VERIFY=1
      CODECOLLECTIVE_ARGS+=("--no-verify")
      shift
      ;;
    --verbose)
      VERBOSE=1
      CODECOLLECTIVE_ARGS+=("--verbose")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      CODECOLLECTIVE_ARGS+=("$@")
      break
      ;;
    *)
      echo "[deploy] unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$CODECOLLECTIVE_COMPONENT" in
  site|org|pidp|all) ;;
  *)
    echo "[deploy] invalid --portal-component: $CODECOLLECTIVE_COMPONENT" >&2
    exit 1
    ;;
esac

case "$CODECOLLECTIVE_TARGET" in
  prod|dev|both) ;;
  *)
    echo "[deploy] invalid --portal-target: $CODECOLLECTIVE_TARGET" >&2
    exit 1
    ;;
esac

if ! command -v npm >/dev/null 2>&1; then
  echo "[deploy] npm not found; install Node.js/npm first" >&2
  exit 1
fi

if [[ "$DEPLOY_MEDTECH" -eq 1 ]]; then
  echo "[deploy][medtech] installing dependencies"
  npm ci

  echo "[deploy][medtech] building and deploying medtech.social"
  npm run build
  npx wrangler deploy "${MEDTECH_ARGS[@]}"
fi

if [[ "$DEPLOY_CODECOLLECTIVE" -eq 1 ]]; then
  if [[ ! -x "$CODECOLLECTIVE_DIR/deploy.sh" ]]; then
    echo "[deploy][portal] missing executable: $CODECOLLECTIVE_DIR/deploy.sh" >&2
    echo "[deploy][portal] set CODECOLLECTIVE_DIR or check out ../CodeCollective" >&2
    exit 1
  fi

  echo "[deploy][portal] deploying CodeCollective component: $CODECOLLECTIVE_COMPONENT"
  if [[ "$CODECOLLECTIVE_COMPONENT" == "all" ]]; then
    echo "[deploy][portal] backend deployment can apply remote D1 migrations"
  fi

  (
    cd "$CODECOLLECTIVE_DIR"
    ./deploy.sh \
      --component "$CODECOLLECTIVE_COMPONENT" \
      --target "$CODECOLLECTIVE_TARGET" \
      "${CODECOLLECTIVE_ARGS[@]}"
  )
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[deploy] complete (dry-run)"
elif [[ "$NO_VERIFY" -eq 1 ]]; then
  echo "[deploy] complete (verification skipped where supported)"
elif [[ "$VERBOSE" -eq 1 ]]; then
  echo "[deploy] complete"
else
  echo "[deploy] complete"
fi
