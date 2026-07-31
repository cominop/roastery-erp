#!/usr/bin/env bash
#
# promote.sh — Roastery ERP Metadata Promotion Pipeline
#
# Step 88: CI/CD promotion script that exports metadata from one
# environment and imports it into another (dev → staging → prod).
#
# In the current single-machine dev setup, this exports from the
# current database, copies the archive, and re-imports to simulate
# a multi-environment promotion flow.
#
# Usage:
#   ./src/metadata/scripts/promote.sh --from dev --to staging
#   ./src/metadata/scripts/promote.sh --from staging --to prod
#   ./src/metadata/scripts/promote.sh --help
#

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Defaults ────────────────────────────────────────────
FROM_ENV=""
TO_ENV=""
MESSAGE=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXPORT_SCRIPT="$SCRIPT_DIR/export-metadata.sh"
IMPORT_SCRIPT="$SCRIPT_DIR/import-metadata.sh"

VALID_ENVS=("dev" "development" "staging" "stage" "prod" "production")

# ─── Help ────────────────────────────────────────────────
show_help() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   Roastery ERP — Metadata Promotion         ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "Promotes metadata from one environment to another by exporting"
  echo "from the source and importing into the target."
  echo ""
  echo "Usage:"
  echo "  $(basename "$0") --from dev --to staging         First promotion hop"
  echo "  $(basename "$0") --from staging --to prod        Production promotion"
  echo "  $(basename "$0") --help                          Show this help"
  echo ""
  echo "Options:"
  echo "  --from <env>     Source environment (dev/staging/prod)"
  echo "  --to <env>       Target environment (dev/staging/prod)"
  echo "  --message <text> Optional custom message for the export"
  echo "  --help           Show this help message and exit"
  echo ""
  echo "Valid environments: ${VALID_ENVS[*]}"
  echo ""
}

# ─── Validate environment ───────────────────────────────
is_valid_env() {
  local e="$1"
  for v in "${VALID_ENVS[@]}"; do
    if [ "$v" = "$e" ]; then
      return 0
    fi
  done
  return 1
}

# Normalize env names
normalize_env() {
  case "$1" in
    dev|development)  echo "development" ;;
    stage|staging)    echo "staging" ;;
    prod|production)  echo "production" ;;
    *)                echo "$1" ;;
  esac
}

# ─── Parse args ─────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --from)
      FROM_ENV="$2"
      shift 2
      ;;
    --to)
      TO_ENV="$2"
      shift 2
      ;;
    --message)
      MESSAGE="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}✗ Unknown option: $1${NC}"
      echo "  Use --help for usage information."
      exit 1
      ;;
  esac
done

# ─── Validate args ──────────────────────────────────────
if [ -z "$FROM_ENV" ] || [ -z "$TO_ENV" ]; then
  echo -e "${RED}✗ Both --from and --to are required.${NC}"
  echo "  Usage: $(basename "$0") --from dev --to staging"
  exit 1
fi

FROM_ENV="$(normalize_env "$FROM_ENV")"
TO_ENV="$(normalize_env "$TO_ENV")"

if ! is_valid_env "$FROM_ENV"; then
  echo -e "${RED}✗ Invalid source environment: ${FROM_ENV}${NC}"
  echo "  Valid: ${VALID_ENVS[*]}"
  exit 1
fi

if ! is_valid_env "$TO_ENV"; then
  echo -e "${RED}✗ Invalid target environment: ${TO_ENV}${NC}"
  echo "  Valid: ${VALID_ENVS[*]}"
  exit 1
fi

if [ "$FROM_ENV" = "$TO_ENV" ]; then
  echo -e "${RED}✗ Source and target environments are the same: ${FROM_ENV}${NC}"
  echo "  Promotion requires different environments."
  exit 1
fi

cd "$PROJECT_DIR"

# ─── Verify helper scripts exist ─────────────────────────
if [ ! -f "$EXPORT_SCRIPT" ]; then
  echo -e "${RED}✗ Export script not found: ${EXPORT_SCRIPT}${NC}"
  exit 1
fi
if [ ! -f "$IMPORT_SCRIPT" ]; then
  echo -e "${RED}✗ Import script not found: ${IMPORT_SCRIPT}${NC}"
  exit 1
fi

# ─── Promotion header ────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
PROMO_ARCHIVE="deploy/promotion-${FROM_ENV}-to-${TO_ENV}-${TIMESTAMP}.zip"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Metadata Promotion — ${FROM_ENV} → ${TO_ENV}              ${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Phase 1: Export from source ───────────────────────
echo -e "${YELLOW}Phase 1/3: Exporting metadata from ${FROM_ENV}...${NC}"
echo ""

EXPORT_MESSAGE="${MESSAGE:-Promotion from ${FROM_ENV} to ${TO_ENV}}"

if ! bash "$EXPORT_SCRIPT" --source "$FROM_ENV" --message "$EXPORT_MESSAGE"; then
  echo -e "${RED}✗ Export from ${FROM_ENV} failed. Aborting promotion.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Export from ${FROM_ENV} complete${NC}"
echo ""

# Find the archive that was just created
LATEST_ARCHIVE="$(ls -t deploy/erp_metadata_*.zip 2>/dev/null | head -1)"
if [ -z "$LATEST_ARCHIVE" ]; then
  echo -e "${RED}✗ No export archive found in deploy/.${NC}"
  exit 1
fi
echo -e "  Latest archive: ${CYAN}${LATEST_ARCHIVE}${NC}"
echo ""

# ─── Phase 2: Transfer archive ─────────────────────────
echo -e "${YELLOW}Phase 2/3: Preparing archive for ${TO_ENV}...${NC}"

# Copy to promotion-named archive (simulates scp to target env)
cp "$LATEST_ARCHIVE" "$PROMO_ARCHIVE"
echo -e "${GREEN}  ✓ Archive staged: ${PROMO_ARCHIVE}${NC}"
git add "$PROMO_ARCHIVE" 2>/dev/null || true

# Also create a 'latest' symlink for the target env
LATEST_LINK="deploy/latest-${TO_ENV}.zip"
ln -sf "$(basename "$PROMO_ARCHIVE")" "$LATEST_LINK" 2>/dev/null || true
echo -e "${GREEN}  ✓ Symlink: ${LATEST_LINK} → $(basename "$PROMO_ARCHIVE")${NC}"
echo ""

# ─── Phase 3: Import to target ─────────────────────────
echo -e "${YELLOW}Phase 3/3: Importing metadata into ${TO_ENV}...${NC}"
echo ""

if ! bash "$IMPORT_SCRIPT" --archive "$PROMO_ARCHIVE"; then
  echo -e "${RED}✗ Import to ${TO_ENV} failed.${NC}"
  echo "  The export archive is preserved at: ${PROMO_ARCHIVE}"
  echo "  To retry the import: bash ${IMPORT_SCRIPT} --archive ${PROMO_ARCHIVE}"
  exit 1
fi
echo -e "${GREEN}✓ Import to ${TO_ENV} complete${NC}"
echo ""

# ─── Success summary ────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Promotion Complete — ${FROM_ENV} → ${TO_ENV}              ${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  From:       ${CYAN}${FROM_ENV}${NC}"
echo -e "  To:         ${CYAN}${TO_ENV}${NC}"
echo -e "  Archive:    ${CYAN}${PROMO_ARCHIVE}${NC}"
echo -e "  Timestamp:  ${CYAN}${TIMESTAMP}${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  - Verify the imported metadata in the UI"
echo -e "  - Check Backup List for the pre-import backup"
echo -e "  - If needed, roll back via Backup List or CLI"
echo ""
exit 0
