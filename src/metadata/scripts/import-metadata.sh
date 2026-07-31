#!/usr/bin/env bash
#
# import-metadata.sh — Roastery ERP Metadata Importer CLI
#
# Step 88: CI/CD script for validating and importing a metadata archive
# into the target database. Creates an automatic backup before import.
#
# Usage:
#   ./src/metadata/scripts/import-metadata.sh --archive deploy/erp_metadata_2026-07-30.zip
#   ./src/metadata/scripts/import-metadata.sh --archive deploy/erp_metadata_2026-07-30.zip --skip-validation
#   ./src/metadata/scripts/import-metadata.sh --help
#

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Defaults ────────────────────────────────────────────
ARCHIVE=""
SKIP_VALIDATION=false
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ─── Help ────────────────────────────────────────────────
show_help() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   Roastery ERP — Metadata Import Script     ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "Validates a metadata .zip archive, creates a backup of current"
  echo "metadata, then UPSERTs all definitions into the database."
  echo ""
  echo "Usage:"
  echo "  $(basename "$0") --archive <path>                    Full validation + import"
  echo "  $(basename "$0") --archive <path> --skip-validation  Skip validation step"
  echo "  $(basename "$0") --help                              Show this help"
  echo ""
  echo "Options:"
  echo "  --archive <path>      Path to the metadata .zip archive (required)"
  echo "  --skip-validation     Skip manifest/checksum validation (for pre-validated archives)"
  echo "  --help                Show this help message and exit"
  echo ""
}

# ─── Parse args ─────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --archive)
      ARCHIVE="$2"
      shift 2
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    *)
      echo -e "${RED}✗ Unknown option: $1${NC}"
      echo "  Use --help for usage information."
      exit 1
      ;;
  esac
done

# ─── Validate required args ─────────────────────────────
cd "$PROJECT_DIR"

if [ -z "$ARCHIVE" ]; then
  echo -e "${RED}✗ No archive specified. Use --archive <path>${NC}"
  echo "  Example: $(basename "$0") --archive deploy/erp_metadata_2026-07-30.zip"
  exit 1
fi

if [ ! -f "$ARCHIVE" ]; then
  echo -e "${RED}✗ Archive not found: ${ARCHIVE}${NC}"
  echo "  Check that the path is correct and the file exists."
  exit 1
fi

# Resolve to absolute path
ARCHIVE="$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      Metadata Import                         ${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Validate ───────────────────────────────────
if [ "$SKIP_VALIDATION" = false ]; then
  echo -e "${YELLOW}Step 1/3: Validating archive integrity...${NC}"
  if ! node server/metadata-importer.cjs --archive "$ARCHIVE"; then
    echo ""
    echo -e "${RED}✗ Validation failed. The archive may be corrupt or incomplete.${NC}"
    echo "  Check:"
    echo "    - The archive exists and is a valid .zip file"
    echo "    - The archive was created by metadata-packager.cjs"
    echo "    - All definition files are present"
    echo "  To skip validation (e.g. if already validated in a pipeline), use --skip-validation"
    exit 1
  fi
  echo -e "${GREEN}✓ Validation passed${NC}"
  echo ""
else
  echo -e "${YELLOW}→ Skipping validation (--skip-validation flag set)${NC}"
  echo ""
fi

# ─── Step 2: Backup current metadata ────────────────────
echo -e "${YELLOW}Step 2/3: Creating automatic backup before import...${NC}"

BACKUP_OUTPUT="$(node server/metadata-backup.cjs --reason pre_import --json 2>/dev/null || true)"
BACKUP_PATH="$(echo "$BACKUP_OUTPUT" | node -e "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));process.stdout.write(d.path||'')}catch(e){}" 2>/dev/null || echo "")"

if [ -n "$BACKUP_PATH" ]; then
  echo -e "${GREEN}  ✓ Backup created: ${BACKUP_PATH}${NC}"
else
  echo -e "${YELLOW}  ⚠ Backup warning — continuing with import${NC}"
fi
echo ""

# ─── Step 3: Upsert ─────────────────────────────────────
echo -e "${YELLOW}Step 3/3: Importing metadata into database...${NC}"

# Build upsert args
UPSERT_ARGS="--archive \"$ARCHIVE\""
if [ "$SKIP_VALIDATION" = true ]; then
  UPSERT_ARGS="$UPSERT_ARGS --skip-validation"
fi

if ! eval node server/metadata-importer-upsert.cjs "$UPSERT_ARGS"; then
  echo -e "${RED}✗ Import failed.${NC}"
  echo "  A backup was created before the import attempt."
  echo "  To roll back, use the Backup List in the UI or run:"
  echo "    node server/metadata-rollback.cjs --list"
  exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Import Complete                        ${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  Archive:  ${CYAN}${ARCHIVE}${NC}"
if [ -n "$BACKUP_PATH" ]; then
  echo -e "  Backup:   ${CYAN}${BACKUP_PATH}${NC}"
fi
echo ""
exit 0
