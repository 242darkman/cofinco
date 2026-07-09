#!/bin/sh
# ============================================================
# Download GeoNames data files needed for geography seeding.
#
# Downloads .zip from https://download.geonames.org/export/dump/
# and extracts the .txt file into seeds/.
#
# Idempotent: skips files that already exist.
#
# Usage:
#   sh scripts/download-geonames.sh              # all files
#   sh scripts/download-geonames.sh allCountries  # specific file
# ============================================================

set -e

SEEDS_DIR="$(cd "$(dirname "$0")/../seeds" && pwd)"
GEONAMES_URL="https://download.geonames.org/export/dump"

# Files to download (name without extension — expects .zip → .txt)
#   CG          : géographie OPÉRATIONNELLE Congo (fichier GeoNames par pays, ~qq Mo)
#   cities5000  : référentiel MONDIAL de villes >5000 hab. (lieu de naissance, villes_reference)
# Élargir la liste (ex. "CG CM GA cities5000") pour couvrir d'autres pays d'exploitation.
DEFAULT_FILES="CG cities5000"

download_and_extract() {
  file="$1"
  target="$SEEDS_DIR/${file}.txt"

  if [ -f "$target" ]; then
    size=$(du -h "$target" | cut -f1)
    echo "[geonames] ${file}.txt already exists (${size}), skipping"
    return 0
  fi

  echo "[geonames] Downloading ${file}.zip ..."
  wget -q -O "$SEEDS_DIR/${file}.zip" "${GEONAMES_URL}/${file}.zip" || {
    echo "[geonames] ERROR: failed to download ${file}.zip" >&2
    rm -f "$SEEDS_DIR/${file}.zip"
    return 1
  }

  echo "[geonames] Extracting ${file}.txt ..."
  unzip -o -q -d "$SEEDS_DIR" "$SEEDS_DIR/${file}.zip" "${file}.txt" || {
    echo "[geonames] ERROR: failed to extract ${file}.txt" >&2
    rm -f "$SEEDS_DIR/${file}.zip"
    return 1
  }

  rm -f "$SEEDS_DIR/${file}.zip"
  size=$(du -h "$target" | cut -f1)
  echo "[geonames] ${file}.txt ready (${size})"
}

# ---- main ----
files="${*:-$DEFAULT_FILES}"
for f in $files; do
  download_and_extract "$f"
done

echo "[geonames] Done."
