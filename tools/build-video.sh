#!/usr/bin/env bash
# Encode web deliverables from the master showreel.
#
# The master is 1920x1080 with a 2.39:1 image letterboxed inside it, and it
# opens on a ~4s black title card. Both get removed here: CROP strips the bars
# so the frame can go full-bleed, and the hero loop starts after the card.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="Show reel 26 copy.mov"
OUT="site/assets/video"
CROP="crop=1920:804:0:138"
# The hero loop MUST share the reel's exact crop. The hero hands over to the
# reel mid-shot, and any difference in aspect makes `object-fit: cover` frame
# the two differently — the picture jumps at the very moment the transition
# is trying to be invisible. The reel's burned-in subtitles sit low enough
# that the hero scrim swallows them while the titles are up.
HERO_CROP="$CROP"
mkdir -p "$OUT"

# --- Hero loop: silent, short, aggressively compressed. It sits behind
# --- typography under a scrim, so it only has to survive being darkened.
ffmpeg -y -v error -ss 4.2 -i "$SRC" -t 22 -an \
  -vf "$HERO_CROP,scale=1600:-2:flags=lanczos,fps=24" \
  -c:v libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/hero-loop.mp4"

# The WebM must match its MP4 sibling's resolution. It is listed first in the
# markup, so every VP9-capable browser takes it -- when it was 1280 against a
# 1600 MP4, that meant Chrome and Firefox got the soft hero and only Safari
# got the sharp one. Same pixels, fewer bytes, is the whole point of offering it.
ffmpeg -y -v error -ss 4.2 -i "$SRC" -t 22 -an \
  -vf "$HERO_CROP,scale=1600:-2:flags=lanczos,fps=24" \
  -c:v libvpx-vp9 -crf 41 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  "$OUT/hero-loop.webm"

# --- Large displays. The master crops to 1920 wide, so this is the ceiling:
# --- anything beyond it would be an upscale pretending to be detail.
ffmpeg -y -v error -ss 4.2 -i "$SRC" -t 22 -an \
  -vf "$HERO_CROP,scale=1920:-2:flags=lanczos,fps=24" \
  -c:v libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/hero-loop-xl.mp4"

ffmpeg -y -v error -ss 4.2 -i "$SRC" -t 22 -an \
  -vf "$HERO_CROP,scale=1920:-2:flags=lanczos,fps=24" \
  -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  "$OUT/hero-loop-xl.webm"

# Mobile: the weight matters more than the resolution here.
ffmpeg -y -v error -ss 4.2 -i "$SRC" -t 22 -an \
  -vf "$HERO_CROP,scale=1000:-2:flags=lanczos,fps=24" \
  -c:v libx264 -profile:v main -crf 30 -preset slow -pix_fmt yuv420p \
  -movflags +faststart "$OUT/hero-loop-sm.mp4"

# --- Full reel, with sound. Loaded only when the visitor asks for it.
ffmpeg -y -v error -i "$SRC" \
  -vf "$CROP,scale=1920:-2:flags=lanczos" \
  -c:v libx264 -profile:v high -crf 25 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 160k -ac 2 \
  -movflags +faststart "$OUT/reel.mp4"

# --- Posters, pulled from frames that actually have an image on them.
ffmpeg -y -v error -ss 8  -i "$SRC" -frames:v 1 -vf "$HERO_CROP,scale=1920:-2" -q:v 3 "$OUT/hero-poster.jpg"

# --- Social share card. 2.39:1 gets cropped hard by every preview, so this is
# --- cut to the 1.91:1 the Open Graph tags declare.
ffmpeg -y -v error -ss 8 -i "$SRC" -frames:v 1 \
  -vf "$HERO_CROP,scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630" \
  -q:v 3 "$OUT/share-card.jpg"
ffmpeg -y -v error -ss 30 -i "$SRC" -frames:v 1 -vf "$CROP,scale=1920:-2" -q:v 3 "$OUT/reel-poster.jpg"

# --- Film stills for the two directed pieces, cut from the reel sections
# --- where each one appears.
ffmpeg -y -v error -ss 44 -i "$SRC" -frames:v 1 -vf "$CROP,scale=1800:-2" -q:v 3 "$OUT/b2b-ranch-still.jpg"
ffmpeg -y -v error -ss 26 -i "$SRC" -frames:v 1 -vf "$CROP,scale=1800:-2" -q:v 3 "$OUT/paixao-calejada-still.jpg"

ls -lh "$OUT"
