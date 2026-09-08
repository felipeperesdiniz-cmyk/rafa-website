#!/usr/bin/env bash
# Render the social share card: the 1.91:1 image every crawler pulls when the
# site is shared or listed in search.
#
# It is a hero frame with the name set over it, in the site's own type and
# palette, so a shared link reads as the site rather than as an anonymous
# sunset. The layout lives in tools/share-card/card.html and is rendered by
# headless Chrome at 2x, then downsampled — text at this size shows every
# rasteriser artefact, and the supersample is what keeps the edges clean.
set -euo pipefail

cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="tools/share-card/card.html"
OUT="site/assets/share-card.jpg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }

# The fonts come from Google Fonts over the network, so give the render a
# virtual-time budget rather than screenshotting the fallback stack.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,630 \
  --virtual-time-budget=8000 \
  --screenshot="$TMP/card.png" "$SRC" >/dev/null 2>&1

sips -Z 1200 --setProperty format jpeg --setProperty formatOptions 82 \
  "$TMP/card.png" --out "$OUT" >/dev/null

ls -lh "$OUT"
