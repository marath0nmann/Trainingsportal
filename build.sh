#!/bin/bash
# build.sh – Automatischer Build für das Trainingsportal
# Liest aktuelle Version aus index.html, erhöht um 1, baut paket_vXXX.zip
# Aktualisiert automatisch: index.html, README.md, COMMIT_EDITMSG, CHANGELOG.md

set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${OUT_DIR:-/mnt/user-data/outputs}"
[ -d "$OUT_DIR" ] || OUT_DIR="$REPO_DIR/.."

# ── Version aus index.html lesen und erhöhen ────────────────────────────────
CUR_VER=$(grep -o 'v[0-9]\+' "$REPO_DIR/htdocs/index.html" | grep -m1 'v[0-9]' | tr -d 'v')
NEW_VER=$((CUR_VER + 1))
PKG="paket_v${NEW_VER}"
DATUM=$(date '+%B %Y')

echo ""
echo "🔢 Version: v${CUR_VER} → v${NEW_VER}"

# ── index.html aktualisieren ────────────────────────────────────────────────
sed -i.bak "s/v${CUR_VER}/v${NEW_VER}/g" "$REPO_DIR/htdocs/index.html"
sed -i.bak2 "s/?v=[0-9][0-9]*/?v=${NEW_VER}/g" "$REPO_DIR/htdocs/index.html"
rm -f "$REPO_DIR/htdocs/index.html.bak" "$REPO_DIR/htdocs/index.html.bak2"
echo "✓ index.html → v${NEW_VER}"

# ── README.md aktualisieren ──────────────────────────────────────────────────
sed -i.bak "s/## Version v[0-9][0-9]*/## Version v${NEW_VER}/" "$REPO_DIR/README.md"
sed -i.bak2 "s/| Stand: [^|]*/| Stand: ${DATUM} /" "$REPO_DIR/README.md"
rm -f "$REPO_DIR/README.md.bak" "$REPO_DIR/README.md.bak2"
echo "✓ README.md → v${NEW_VER}"

# ── COMMIT_EDITMSG aktualisieren ─────────────────────────────────────────────
CHANGELOG_MSG=$(grep -m1 '^- ' "$REPO_DIR/CHANGELOG.md" | sed 's/^- //')
if [ -n "$CHANGELOG_MSG" ]; then
  echo "v${NEW_VER} – ${CHANGELOG_MSG}" > "$REPO_DIR/COMMIT_EDITMSG"
else
  echo "v${NEW_VER}" > "$REPO_DIR/COMMIT_EDITMSG"
fi
echo "✓ COMMIT_EDITMSG → v${NEW_VER}"

# ── CHANGELOG.md: Version in oberstem Eintrag aktualisieren ─────────────────
sed -i.bak "s/^## v${CUR_VER}$/## v${NEW_VER}/" "$REPO_DIR/CHANGELOG.md"
rm -f "$REPO_DIR/CHANGELOG.md.bak"
echo "✓ CHANGELOG.md → v${NEW_VER}"

# ── Git: vom Build geänderte Dateien stagen ─────────────────────────────────
git -C "$REPO_DIR" add htdocs/index.html README.md CHANGELOG.md COMMIT_EDITMSG 2>/dev/null || true
echo "✓ git add: index.html, README.md, CHANGELOG.md, COMMIT_EDITMSG"

# ── ZIP bauen ───────────────────────────────────────────────────────────────
TMP="$REPO_DIR/../${PKG}"
rm -rf "$TMP"
cp -r "$REPO_DIR" "$TMP"
rm -f "$OUT_DIR/${PKG}.zip"
cd "$REPO_DIR/.."
zip -r "$OUT_DIR/${PKG}.zip" "${PKG}/" \
  --exclude "${PKG}/.git/*" \
  --exclude "${PKG}/htdocs/js/*.bak" \
  --exclude "__MACOSX/*" \
  -q
rm -rf "$TMP"

echo "✓ $(du -sh "$OUT_DIR/${PKG}.zip" | cut -f1)  →  $OUT_DIR/${PKG}.zip"
echo ""
