#!/usr/bin/env bash
#
# export-metadata.sh — Roastery ERP Metadata Exporter CLI
#
# Step 88: CI/CD script for exporting metadata into a deployable .zip archive
# and committing it to git with a version tag.
#
# Usage:
#   ./src/metadata/scripts/export-metadata.sh
#   ./src/metadata/scripts/export-metadata.sh --source staging --message "Pre-deployment export"
#   ./src/metadata/scripts/export-metadata.sh --help
#

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ─── Defaults ────────────────────────────────────────────
SOURCE="development"
MESSAGE="Metadata export"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ─── Help ────────────────────────────────────────────────
show_help() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   Roastery ERP — Metadata Export Script     ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
  echo "Exports all ERP metadata from the database into definition"
  echo "JSON files, packages them into a .zip archive, and commits"
  echo "the archive to git with a version tag."
  echo ""
  echo "Usage:"
  echo "  $(basename "$0")                         Default export (source=development)"
  echo "  $(basename "$0") --source staging        Export tagged as staging"
  echo "  $(basename "$0") --message \"My export\"   Custom description"
  echo "  $(basename "$0") --help                   Show this help"
  echo ""
  echo "Options:"
  echo "  --source <env>      Environment label (dev/staging/prod). Default: development"
  echo "  --message <text>    Description of this export. Default: 'Metadata export'"
  echo "  --help              Show this help message and exit"
  echo ""
}

# ─── Parse args ─────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      show_help
      exit 0
      ;;
    --source)
      SOURCE="$2"
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

# ─── Working directory ──────────────────────────────────
cd "$PROJECT_DIR"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      Metadata Export — ${SOURCE}             ${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Export definitions from DB ─────────────────
echo -e "${YELLOW}Step 1/4: Exporting metadata from database...${NC}"
if ! node server/metadata-exporter.cjs; then
  echo -e "${RED}✗ Export failed. Check database connection and server logs.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Export complete${NC}"
echo ""

# ─── Step 2: Package into .zip ──────────────────────────
TIMESTAMP="$(date +%Y-%m-%d)"
ARCHIVE_NAME="erp_metadata_${TIMESTAMP}.zip"
ARCHIVE_PATH="${PROJECT_DIR}/deploy/${ARCHIVE_NAME}"

echo -e "${YELLOW}Step 2/4: Packaging metadata archive...${NC}"
if ! node server/metadata-packager.cjs \
  --description "$MESSAGE" \
  --source "$SOURCE" \
  --output "$ARCHIVE_PATH"; then
  echo -e "${RED}✗ Packaging failed.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Package created: ${ARCHIVE_PATH}${NC}"
echo ""

# ─── Step 3: Git commit ─────────────────────────────────
echo -e "${YELLOW}Step 3/4: Committing archive to git...${NC}"

# Get current version from package.json
VERSION="$(node -e "console.log(require('./package.json').version)")"

git add "$ARCHIVE_PATH" 2>/dev/null || true

# Check if there's anything to commit (archive might be unchanged)
if git diff --cached --quiet; then
  echo -e "${YELLOW}  ℹ No changes to commit (archive already up-to-date)${NC}"
else
  git commit -m "chore: metadata export ${TIMESTAMP}" --quiet
  echo -e "${GREEN}  ✓ Committed: chore: metadata export ${TIMESTAMP}${NC}"
fi

# Tag (delete existing tag for same version if it exists, then create new)
TAG="deploy/v${VERSION}"
if git tag | grep -q "^${TAG}$"; then
  echo -e "${YELLOW}  ℹ Tag ${TAG} already exists — moving to current commit${NC}"
  git tag -d "$TAG" >/dev/null 2>&1
fi
git tag "$TAG"
echo -e "${GREEN}  ✓ Tagged: ${TAG}${NC}"
echo ""

# ─── Step 4: Verify ─────────────────────────────────────
echo -e "${YELLOW}Step 4/4: Verification...${NC}"

if [ -f "$ARCHIVE_PATH" ]; then
  ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
  echo -e "${GREEN}  ✓ Archive exists: ${ARCHIVE_PATH} (${ARCHIVE_SIZE})${NC}"
else
  echo -e "${RED}  ✗ Archive not found at ${ARCHIVE_PATH}${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Export Complete — ${SOURCE}             ${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo -e "  Archive:  ${CYAN}${ARCHIVE_PATH}${NC}"
echo -e "  Tag:      ${CYAN}${TAG}${NC}"
echo -e "  Version:  ${CYAN}v${VERSION}${NC}"
echo ""
exit 0
