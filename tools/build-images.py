#!/usr/bin/env python3
"""Generate web-ready WebP derivatives + LQIP data URIs from the raw photos.

Outputs:
  site/assets/photos/<slug>-<width>.webp  one file per width the source can
                                          actually fill, named for its real
                                          pixel width
  site/js/photos.js                       manifest consumed by the site

Derivatives are never upscaled, and the filename is never a promise the file
cannot keep. A source whose long edge is 1080px produces exactly one 1080px
derivative, and `srcs` in the manifest reports 1080 -- so the srcset that
reaches the browser describes the picture that actually exists. The previous
scheme wrote every source out as both "-1200" and "-2400" regardless of what
was in it, which meant a 1080px frame claimed 2400w in the markup, and, because
the two slots were encoded at different qualities, large screens were served a
harsher encode of the very same pixels the small slot held.
"""
import base64
import io
import json
import os
import re

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "assets", "photos")
os.makedirs(OUT, exist_ok=True)

with open(os.path.join(ROOT, "tools", "manifest.json")) as fh:
    items = json.load(fh)

# Long-edge slots we would like, in ascending order. Scaling on the long edge
# keeps tall frames generous; a portrait photo in the 2400 slot is 2400 tall,
# not 2400 wide. Each source fills as many slots as it has pixels for.
LONG_EDGES = [1200, 2400]


def variants_for(w, h):
    """(width, height) of each derivative this source can produce, ascending.

    Never upscales, and never emits the same picture twice under two names.
    Files are keyed by their *width*, because that is what a srcset `w`
    descriptor means -- the rendered width of the file, not its long edge.
    Getting that wrong on a portrait frame tells the browser the picture has
    more horizontal resolution than it does, and it under-selects.
    """
    long_edge = max(w, h)
    out = []
    seen = set()
    for slot in LONG_EDGES:
        scale = min(slot, long_edge) / long_edge
        vw = w if scale >= 1 else round(w * scale)
        vh = h if scale >= 1 else round(h * scale)
        if vw in seen:
            continue
        seen.add(vw)
        out.append((vw, vh))
    return out


def quality_for(vw, vh):
    """Bigger derivative, tighter quality: the large file is the one whose
    weight matters, and it is viewed at a size where the difference does not
    show. Keyed off what was actually emitted, so a source that only fills the
    small slot gets the generous setting rather than inheriting the large one's."""
    return 82 if max(vw, vh) <= 1200 else 78


records = []

for n, item in enumerate(items, 1):
    src = os.path.join(ROOT, item["src"])
    if not os.path.exists(src):
        print(f"  !! missing {item['src']}")
        continue

    im = Image.open(src)
    im = im.convert("RGB")
    w, h = im.size

    variants = variants_for(w, h)
    srcs = [vw for vw, _ in variants]
    for vw, vh in variants:
        dest = os.path.join(OUT, f"{item['slug']}-{vw}.webp")
        if os.path.exists(dest) and os.path.getmtime(dest) > os.path.getmtime(src):
            continue
        out = im.copy() if (vw, vh) == (w, h) else im.resize((vw, vh), Image.LANCZOS)
        out.save(dest, "WEBP", quality=quality_for(vw, vh), method=6)

    # LQIP: a 20px blurred thumb inlined as a data URI, so a frame never
    # flashes empty while its WebP streams in.
    lq = im.copy()
    lq.thumbnail((20, 20), Image.LANCZOS)
    lq = lq.filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    lq.save(buf, "WEBP", quality=45)
    lqip = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

    records.append({
        "slug": item["slug"],
        "title": item["title"],
        "cat": item["cat"],
        "place": item["place"],
        # What the picture actually shows, written per photograph. `place` is
        # a label ("Fernando de Noronha" sits on two different frames); alt
        # text has to describe, and has to be unique, or a screen reader hears
        # the same sentence twice and search engines index neither.
        "alt": item.get("alt") or item["place"],
        "year": item["year"],
        "w": w,
        "h": h,
        "ratio": round(w / h, 4),
        "orient": "portrait" if h > w * 1.04 else ("square" if abs(w - h) < w * 0.04 else "landscape"),
        # File widths, ascending -- exactly what goes in a srcset `w`
        # descriptor. The site reads srcs[0] as the default src and srcs[-1]
        # as the best it can offer, so it never has to guess what exists.
        "srcs": srcs,
        "lqip": lqip,
    })
    short = "  <- under 1200px; needs a bigger original" if max(w, h) < 1200 else ""
    print(f"  [{n:02d}/{len(items)}] {item['slug']}  {w}x{h}  -> {srcs}{short}")

js = os.path.join(ROOT, "site", "js", "photos.js")
with open(js, "w") as fh:
    fh.write("// Generated by tools/build-images.py. Do not edit by hand.\n")
    fh.write("export const PHOTOS = ")
    json.dump(records, fh, indent=1, ensure_ascii=False)
    fh.write(";\n")

# Write a plain, complete version of the grid straight into the HTML. main.js
# swaps it for the art-directed, filterable one, but this is what search
# engines and no-JS visitors get, and it keeps every photo's alt text in the
# served markup rather than behind a script.
def escape(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


cells = []
for r in records:
    alt = escape(r["alt"])
    srcs = r["srcs"]
    srcset = ", ".join(f'assets/photos/{r["slug"]}-{v}.webp {v}w' for v in srcs)
    # One variant means there is nothing to choose between, so srcset and sizes
    # would only be noise for the browser to evaluate.
    picker = (
        f'               srcset="{srcset}"\n'
        f'               sizes="(max-width: 900px) 92vw, 31vw"\n'
        if len(srcs) > 1 else ""
    )
    cells.append(
        f'      <figure class="cell" data-span="4">\n'
        f'        <span class="cell__media" style="aspect-ratio:{r["ratio"]}">\n'
        f'          <img src="assets/photos/{r["slug"]}-{srcs[0]}.webp"\n'
        f'{picker}'
        f'               alt="{alt}" width="{r["w"]}" height="{r["h"]}"\n'
        f'               loading="lazy" decoding="async" />\n'
        f'        </span>\n'
        f'      </figure>'
    )

html_path = os.path.join(ROOT, "site", "index.html")
with open(html_path) as fh:
    html = fh.read()
start, end = "<!-- grid:start -->", "<!-- grid:end -->"
a, b = html.index(start) + len(start), html.index(end)
html = html[:a] + "\n" + "\n".join(cells) + "\n      " + html[b:]

with open(html_path, "w") as fh:
    fh.write(html)
print(f"static grid: {len(cells)} figures written into site/index.html")

# Drop derivatives for photos no longer in the manifest, so removing an entry
# does not leave orphaned files in the deployed folder.
live = {f"{r['slug']}-{v}.webp" for r in records for v in r["srcs"]}
orphans = [f for f in os.listdir(OUT) if f.endswith(".webp") and f not in live]
for f in orphans:
    os.remove(os.path.join(OUT, f))
if orphans:
    print(f"pruned {len(orphans)} orphaned derivative(s)")

total = sum(
    os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(".webp")
)
files = sum(len(r["srcs"]) for r in records)
capped = [r for r in records if max(r["srcs"][-1], round(r["srcs"][-1] / r["ratio"])) < LONG_EDGES[-1]]
print(f"\n{len(records)} photos -> {files} webp files, {total / 1e6:.1f} MB total")
if capped:
    print(f"\n{len(capped)} of {len(records)} sources cannot fill {LONG_EDGES[-1]}px. The site now")
    print("says so honestly rather than claiming a width it does not have, but the")
    print("only real fix is a larger original:")
    for r in sorted(capped, key=lambda r: r["srcs"][-1])[:10]:
        print(f"    {r['slug']:24} {r['w']}x{r['h']}")
    if len(capped) > 10:
        print(f"    ... and {len(capped) - 10} more")
print(f"\nmanifest: {js}")
