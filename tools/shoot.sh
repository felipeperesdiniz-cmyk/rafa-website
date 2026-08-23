#!/usr/bin/env bash
# Screenshot the running site with headless Chrome.
#   ./tools/shoot.sh <out.png> [width] [height] [#hash]
#
# Chrome does not always exit on its own here (the page runs a permanent
# rAF loop), so it is backgrounded and killed once the file has settled.
set -euo pipefail
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="${1:?out path}"
W="${2:-1440}"
H="${3:-900}"
HASH="${4:-}"
PROFILE="$(mktemp -d)"

rm -f "$OUT"

"$CH" --headless=new \
  --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=8000 \
  ${RM:+--force-prefers-reduced-motion} \
  --window-size="$W,$H" \
  --screenshot="$OUT" \
  --user-data-dir="$PROFILE" \
  "http://localhost:4321/$HASH" >/dev/null 2>&1 &
PID=$!

for _ in $(seq 1 60); do
  sleep 1
  [ -s "$OUT" ] || continue
  a=$(stat -f %z "$OUT"); sleep 1; b=$(stat -f %z "$OUT")
  [ "$a" = "$b" ] && break
done

kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
rm -rf "$PROFILE"

[ -s "$OUT" ] && echo "$OUT  ($(du -h "$OUT" | cut -f1))" || { echo "FAILED"; exit 1; }
