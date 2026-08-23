# Rafa Diniz, Photography and Film

A static site. No build step, no framework, no npm install. `site/` is the
whole deployable thing; everything above it is source material and tooling.

```
site/                 ← deploy this folder
  index.html
  css/main.css
  js/main.js          ← behaviour
  js/photos.js        ← GENERATED, do not edit
  assets/photos/      ← GENERATED WebP derivatives
  assets/video/       ← GENERATED web encodes
tools/
  manifest.json       ← EDIT THIS: photo titles, categories, captions
  build-images.py     ← photos → WebP + placeholders + static grid markup
  build-video.sh      ← showreel → hero loop, reel, posters, film stills
  serve.py            ← local dev server (supports Range; see below)
  shoot.py            ← screenshot helper used while building
```

The original full-resolution photos and `Show reel 26 copy.mov` stay in the
project root, untouched. Nothing is overwritten or deleted.

---

## Things to change before this goes live

1. **The email address.** `hello@rafadiniz.com` in `site/index.html` is a
   placeholder. Search for it and put the real one in (it appears once in the
   contact section).
2. **The domain.** `https://rafadiniz.com/` appears in the `canonical` link and
   the JSON-LD block at the top of `site/index.html`.
3. **The captions.** See below. They are my best reading of each photo, not
   Rafa's own record.
4. **Social links.** Only YouTube is linked, in the footer. Add Instagram etc.

---

## Editing the photos

`tools/manifest.json` is the single source of truth. Each entry:

```json
{
  "src": "IMG_1731 copy.jpg",     // filename in the project root
  "slug": "flavian",              // used for the generated filenames + URLs
  "title": "Flavian",             // shown under the frame
  "cat": "architecture",          // architecture | landscape | wildlife
                                  // street | sport | portrait
  "place": "The Colosseum, Rome", // the small caption
  "year": ""                      // currently unused; safe to leave blank
}
```

**On the captions:** the `title` values in the manifest were invented by
looking at each photograph, so the site no longer displays them. The grid is
silent and the lightbox shows the `place` line and the category. Where the
subject identifies itself (the Colosseum, Sacré-Cœur, Place des Vosges, Burj
Khalifa, the Sheikh Zayed Mosque, Morro Dois Irmãos, the UF graduations) the
`place` says so; everywhere else it describes the subject rather than guessing
a location. Read through those and correct anything wrong.

If you want named frames back, put real titles in the manifest and restore the
`figcaption` in `cell()` in `site/js/main.js` and in `tools/build-images.py`.
Poetic titles nobody actually gave the pictures are worse than none.

After editing, rebuild:

```bash
python3 tools/build-images.py
```

That regenerates the WebP files (skipping any already up to date), rewrites
`site/js/photos.js`, and re-writes the static grid inside `site/index.html`.

To add a photo: drop it in the project root, add an entry to the manifest,
rerun the script. To remove one: delete its manifest entry and rerun. The
script prunes the orphaned WebP files on its own.

`tools/manifest-excluded.json` holds the commissioned work pulled from the
site: the remaining UF graduations and the family formal. They are
not deleted; paste an entry back into `manifest.json` and rerun to restore it.
Their `cat` is `commissions`, which would also need adding back to the `CATS`
list at the top of `site/js/main.js` for the filter to appear.

## Re-encoding the video

```bash
./tools/build-video.sh
```

Reads `Show reel 26 copy.mov` and produces the hero loop, the full reel, the
posters, and the two film stills. Requires `ffmpeg`.

## Running it locally

```bash
python3 tools/serve.py 4321
```

Then open `http://localhost:4321`. It must be served over HTTP, not opened as
a `file://` path, because `js/main.js` is an ES module.

**Use that script, not `python3 -m http.server`.** The stock server ignores
HTTP `Range` requests, so the browser cannot seek inside the showreel: the
hero takeover silently starts the reel at 0 and you get four seconds of black
title card instead of the handover. Any real host (Vercel, Netlify, nginx,
S3/CloudFront) supports Range, so this only bites locally, but it looks
exactly like a bug in the site, which is why the script exists.

## Deploying

It is a folder of static files, so anything works. For Vercel, point the
project at `site/` as the output directory with no build command;
`site/vercel.json` sets long-lived cache headers on `assets/`.

---

## How it is built

**Motion:** GSAP + ScrollTrigger, with Lenis as the *only* smooth-scroll
engine. Both load from a CDN as ES modules; if they fail to load, the page
falls back to a complete, static, readable version rather than breaking.
No Three.js: the photographs are the material here, and a shader would have
been decoration.

**The animation brief was "not much on the images."** So on the photography
grid there is almost none: each frame gets one shallow fade-and-rise as it
enters, then holds completely still. Headings reveal word by word. The only
scroll-linked movement in the grid area is a 3% drift on the single
full-bleed frame, switched off on touch.

**The hero takeover is the one real scrubbed sequence.** You land on the
titles over the reel playing quietly. The first scroll dissolves every word
away (headline, lede and the site header, which also goes `inert` so
focus cannot land on something invisible) and hands the frame to the full
showreel, playing with nothing on top of it. On the way out, two bars close to
a true 2.39:1 band (computed from the live viewport, not hardcoded) and
release into the films.

Two details that make the handover work:

- The hero loop is cut from 4.2s of the master, which is where the black
  "Show Reel 26" slate ends. The takeover starts the reel at
  `4.2 + (loop position)`, so the picture simply carries on rather than
  cutting to a title card, and the loop's 22 second cage opens into the whole
  film. Repeats restart after the slate too.
- Scroll is never locked. The stage is sticky, not pinned-and-trapped: keep
  scrolling and you leave normally. `Skip intro` jumps to the films, and the
  player chrome (sound / skip) fades itself out when the pointer goes quiet.

The reel is muted when it takes over, because browsers refuse to autoplay
audio without a user gesture. The `Sound on` button is that gesture. The
`Play the showreel` button in the hero is the direct route: it opens the
reel with real controls and sound, and it is the only route when motion is
off, so it is never hidden.

The section reserves nearly three screens of scroll, so it is gated behind an
`html.motion` class set only once GSAP is live. Under reduced motion, or if
the CDN is unreachable, the hero collapses to a single screen with the titles
and that button, and no dead scroll.

**The takeover is landscape-only.** On a portrait screen a 2.39:1 film either
gets cropped to a sliver by `object-fit: cover`, which also blows the reel's
own burned in subtitles off the edges, or shrinks to a thin strip under
`contain`. Neither is worth 13 MB of a phone's data to discover, so phones
get the hero and the play button, and watch the reel in the overlay where
they can go fullscreen. The guard is an aspect-ratio check in
`heroTakeover()` mirrored by a media query on the hero height; rotating a
phone to landscape after load will not start it, a reload will.

**The showreel appears once.** The hero background *is* the reel, playing
silently and graded down behind the type; the "Play the showreel" control in
the hero promotes it to the full 53 seconds with sound, in the same overlay
the films use. There is deliberately no separate showreel section, because having one
meant a visitor watched twenty seconds of the reel in the hero and was then
asked to press play on the same footage further down, which spent the reveal
before it landed.

**Weight:** 152 MB of source photographs compress to about 16 MB of WebP
across two sizes each. A first visit pulls roughly 1.5 MB, most of which is
the hero loop; the photographs load lazily and the 13 MB showreel is not
fetched at all until someone presses play. Every frame has a tiny blurred
placeholder inlined in the markup so nothing flashes empty.

## Mobile and desktop

Same HTML, different composition, and no second codebase to keep in sync, which
is how the reference sites do it too. What actually changes:

| | phone | tablet | desktop |
|---|---|---|---|
| Hero | one screen, stacked name, full-width play button | one screen | 2.6-screen scroll takeover |
| Films | number → title → still → details → button | same | two columns, alternating sides |
| Grid | one frame per row | two per row | the editorial 12-column layout |
| Filters | horizontal strip with an edge fade | wraps | wraps |
| Reel | overlay only, never prefetched | overlay only | takes over the hero frame |

Checked at 320, 360, 390, 414, 600, 768, 844×390 (phone on its side), 1024,
1280, 1440, 1920 and 2560: nothing overflows horizontally at any of them, and
no control is under 44px on a touch-sized viewport. The menu button was 19px
tall before this pass, which is the sort of thing that only shows up when you
measure it.

**Accessibility:** the split headings keep their unsplit text as the
accessible name and hide the decorative word spans; the lightbox and the film
player trap focus and close on Escape; focus is always visible; and
`prefers-reduced-motion` disables smooth scroll, the hero video autoplay and
every scrubbed animation, rendering final states directly.

**Portrait is a category of one.** `portrait.jpg` is in as a single frame so
the *Portraiture* line in the services list has work behind it. One frame is
enough to be honest but thin to look at. Two or three more would make the
filter carry properly. Add them to the manifest with `"cat": "portrait"`.

## The design pass

A later pass went through the site looking for the things that make a page
read as generated rather than made. What came out, and why:

- **The section numbering.** `001 Directed`, `002 Stills`, `003 Who` and the
  rest. A numbered mono label above every heading is the single most common
  template signature going, and it told the visitor nothing.
- **Every photograph's title.** Forty seven invented two word titles
  (`Vesper`, `Marsh Gold`, `Louvered Dusk`) sat under the frames. They are
  still in the manifest, but the grid is silent now and the lightbox carries
  the subject line instead.
- **The stat row.** `Frames 47 / Films 02 / Based` read as a dashboard. A
  photographer is not judged on the file count of their portfolio page.
- **The preloader.** A counter to 100 in front of a static page, which is
  friction pretending to be craft.
- **The grain overlay.** A noise layer at `z-index: 250` sat on top of the
  photographs, including inside the lightbox.
- **Em dashes and rules of three.** Nearly every sentence had the same shape:
  a balanced clause, a dash, a flourish. The copy was rewritten flat.
- **The orange contact block.** A full bleed accent that shouted louder than
  any picture on the page. It is cream now, and the accent survives only in
  the focus ring and text selection.
- **`Replies within two working days.`** Nobody asked Rafa to promise that.

Two real bugs turned up while looking:

- `.secHead` had `max-width` and `margin: 0 auto` but no `width: 100%`, so the
  auto margins shrink wrapped it against its grid track. Section headings sat
  centred on a wide screen and left aligned on a narrow one.
- `.hdr` used `mix-blend-mode: difference`, which inverts against whatever is
  behind it. Over mid tone photographs the nav went grey, and over the cream
  contact block it disappeared. It now carries a scrim in the hero and a solid
  bar past it.

Then the overlay player, which the `Play the showreel` button opens:

- `.vp__close` was a child of `.vp__box`, so `top/right: var(--edge)` measured
  from the picture rather than the viewport and the Close button sat on top of
  the top right corner of the film. The chrome is now a sibling of the box.
- The box was sized on width alone, `min(94vw, 1400px)`. A 16:9 film on a
  1440x700 viewport came out 761px tall with the page scroll locked, so the
  bottom of the picture and the video control bar with it, fullscreen button
  included, sat below the fold and could not be reached. The width is now
  capped by the height too.
- Escape closed the overlay even while the film was fullscreen, so the one
  press that should have returned you to the overlay tore the player down and
  dropped you back on the page. Escape is now ignored while fullscreen.
- The YouTube embed carried `allowfullscreen` but its `allow` list did not
  name `fullscreen`, which is the combination Chrome has been known to read as
  fullscreen being denied. It is named explicitly now.
- There is an explicit `Fullscreen` button next to `Close`. It fullscreens the
  whole player rather than depending on the native control inside the video,
  falls back to `webkitEnterFullscreen` on iPhone where element fullscreen
  does not exist, and hides itself where neither is available.

`tools/serve.py` was also single threaded, so the grid asking for dozens of
images at once could time out a request and look like a broken asset.

**Nothing here is invented.** Every photograph, both films and the showreel are
Rafa's own. There are no stock images, no testimonials, no client logos, and
no awards or claims of any kind.
