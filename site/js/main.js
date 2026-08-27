/* ============================================================
   Rafa Diniz, site behaviour
   Motion stack: GSAP + ScrollTrigger, Lenis as the single
   smooth-scroll engine. No Locomotive, no Three.js.
   Type carries the motion; photographs arrive and hold still.
   ============================================================ */

import { PHOTOS } from './photos.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const CATS = [
  ['all', 'All'],
  ['architecture', 'Architecture'],
  ['landscape', 'Landscape'],
  ['wildlife', 'Wildlife'],
  ['street', 'Street'],
  ['sport', 'Sport'],
  ['portrait', 'Portrait'],
];

const photoSrc = (slug, w) => `assets/photos/${slug}-${w}.webp`;

/* ── overlay background ───────────────────────────────────
   `is-locked` stops the page scrolling behind an overlay, but a screen
   reader could still walk through it. `inert` removes it from the
   accessibility tree and the tab order for as long as the overlay is up.
   The hero takeover also drives `hdr.inert`, so the previous value is put
   back rather than assumed, and the two never fight over it. */
const BEHIND = ['#hdr', 'main', '.foot'];
let inertWas = null;

function setBackgroundInert(on) {
  if (on) {
    if (inertWas) return;                 // already down; don't re-record
    inertWas = BEHIND.map((sel) => {
      const el = $(sel);
      const was = el ? el.inert : false;
      if (el) el.inert = true;
      return was;
    });
  } else {
    if (!inertWas) return;
    BEHIND.forEach((sel, n) => {
      const el = $(sel);
      if (el) el.inert = inertWas[n];
    });
    inertWas = null;
  }
}

/* ── external libs ────────────────────────────────────────
   Loaded from CDN. Everything below degrades to a complete,
   readable page if these never arrive. */
const CDN = {
  gsap: 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js',
  st: 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/ScrollTrigger.js',
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.1.14/dist/lenis.mjs',
};

let gsap = null;
let ScrollTrigger = null;
let lenis = null;

async function loadMotion() {
  if (REDUCED) return false;
  try {
    const [g, s] = await Promise.all([import(CDN.gsap), import(CDN.st)]);
    gsap = g.gsap || g.default;
    ScrollTrigger = s.ScrollTrigger || s.default;
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('motion');
    return true;
  } catch {
    return false;
  }
}

async function startLenis() {
  if (REDUCED || !gsap) return;
  try {
    const mod = await import(CDN.lenis);
    const Lenis = mod.default || mod.Lenis;
    lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false, // native momentum on touch feels better than a faked one
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis');
  } catch {
    lenis = null;
  }
}

const scrollTo = (target) => {
  if (lenis) lenis.scrollTo(target, { offset: 0 });
  else target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
};

/* ── text splitting ───────────────────────────────────────
   The unsplit text stays as the element's accessible name, so
   screen readers never hear the words as separate fragments. */
function splitWords(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  const frag = document.createDocumentFragment();
  text.split(/(\s+)/).forEach((chunk) => {
    if (!chunk.trim()) { frag.append(chunk); return; }
    const outer = document.createElement('span');
    outer.className = 'split__word';
    outer.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('span');
    inner.className = 'split__inner';
    inner.textContent = chunk;
    outer.append(inner);
    frag.append(outer);
  });
  el.append(frag);

  const inners = $$('.split__inner', el);
  // The CSS offset is a percentage, which GSAP resolves into a *pixel* `y`
  // when it first reads the element, after which tweening `yPercent` alone
  // leaves that pixel offset behind. Hand the start state to GSAP explicitly
  // so it owns both axes. The CSS rule stays as the pre-JS guard.
  if (gsap) gsap.set(inners, { yPercent: 105, y: 0 });
  return inners;
}

/* ── hero ─────────────────────────────────────────────────── */
function heroVideo() {
  const v = $('#heroVideo');
  if (!v) return;

  // Save mobile data: the small cut is meaningfully lighter, and the
  // poster alone is a complete first frame if playback never starts.
  //
  // Within a tier the WebM and the MP4 are the same resolution, so which one
  // a browser picks is a question of bytes, not of picture. They were once
  // 1280 and 1600, which quietly gave Chrome and Firefox the softer hero and
  // Safari the sharp one. The master crops to 1920 wide, so -xl is the
  // ceiling; there is nothing above it that is not an upscale.
  const small = window.matchMedia('(max-width: 760px)').matches;
  const wide  = window.matchMedia('(min-width: 1400px)').matches;
  const sources = small
    ? [['assets/video/hero-loop-sm.mp4', 'video/mp4']]
    : wide
      ? [['assets/video/hero-loop-xl.webm', 'video/webm'], ['assets/video/hero-loop-xl.mp4', 'video/mp4']]
      : [['assets/video/hero-loop.webm', 'video/webm'], ['assets/video/hero-loop.mp4', 'video/mp4']];

  if (REDUCED) return; // poster stands in; never autoplay under reduced motion

  sources.forEach(([src, type]) => {
    const s = document.createElement('source');
    s.src = src; s.type = type;
    v.append(s);
  });
  v.load();
  v.addEventListener('canplay', () => {
    v.classList.add('is-ready');
    v.play().catch(() => {}); // blocked autoplay just leaves the poster up
  }, { once: true });

  // Don't burn cycles on a video nobody can see.
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) v.play().catch(() => {});
    else v.pause();
  }, { threshold: 0.01 });
  io.observe(v);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) v.pause();
    else if (v.getBoundingClientRect().bottom > 0) v.play().catch(() => {});
  });
}

let introTl = null;

function heroIntro() {
  const title = $('.hero__title');
  if (!gsap || REDUCED) return;

  const words = title ? splitWords(title) : [];
  introTl = gsap.timeline({ defaults: { ease: 'expo.out' } })
    .to(words, { yPercent: 0, duration: 1.15, stagger: .07 })
    .from('.hero__lede', { y: 20, opacity: 0, duration: .9 }, '-=.75')
    .from('.hero__foot > *', { y: 18, opacity: 0, duration: .8, stagger: .1 }, '-=.7');
}

/* ── section choreography ─────────────────────────────────── */
function choreograph() {
  if (!gsap || REDUCED) return;

  // Headings reveal word by word as their section arrives.
  $$('[data-split]').forEach((el) => {
    if (el.classList.contains('hero__title')) return;
    const words = splitWords(el);
    gsap.to(words, {
      yPercent: 0, duration: .9, ease: 'expo.out', stagger: .055,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  // Media blocks: a shallow, single arrival. Nothing tracks the scrollbar.
  $$('[data-reveal]').forEach((el) => {
    gsap.to(el, {
      opacity: 1, y: 0, duration: .78, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  // A 3% drift on the featured frame: enough to feel alive, not enough
  // to make the picture hard to study.
  const quiet = $('.quiet__figure img');
  if (quiet && !COARSE) {
    gsap.fromTo(quiet, { yPercent: -3 }, {
      yPercent: 3, ease: 'none',
      scrollTrigger: { trigger: '.quiet', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }
}

/* ── hero takeover ───────────────────────────────────────────
   The first scroll dissolves the titles and hands the frame to the reel,
   full-frame with nothing over it, then closes to 2.39:1 as it releases into
   the films. Scroll is never locked: keep scrolling and you leave normally,
   which is the whole reason this is a sticky stage and not a pinned trap. */
function heroTakeover() {
  const sec = $('#hero');
  const loop = $('#heroVideo');
  const reel = $('#heroReelVideo');
  const controls = $('#heroControls');
  const hdr = $('#hdr');
  if (!sec || !reel || !gsap || REDUCED) return;
  // Portrait screens sit this one out. A 2.39:1 film either gets cropped to a
  // sliver by `cover` or shrinks to a thin strip under `contain`, and it costs
  // a phone 13 MB to find that out. Those visitors get the hero plus the
  // explicit play button, which opens the reel in the overlay where they can
  // go fullscreen, a better way to watch it on a phone regardless.
  if (window.matchMedia('(max-aspect-ratio: 4 / 5)').matches) return;

  // Beats, as fractions of the section's scroll. Everything is expressed in
  // these units so the choreography can be read at a glance and retuned in
  // one place.
  // 14 MB is a lot to spend on someone's behalf. On a metered or slow
  // connection the takeover keeps the hero loop the whole way through
  // instead: the titles still dissolve, the bars still close, and the
  // labelled "Play the showreel" button is still there for anyone who
  // actually wants the film.
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const frugal = !!conn && (conn.saveData === true ||
                            ['slow-2g', '2g', '3g'].includes(conn.effectiveType));

  const ARM  = 0.01;   // begin fetching the reel
  const PLAY = 0.16;   // start it playing, still invisible, so it has decoded
  const HDR  = 0.10;   // header leaves with the titles
  const SWAP = 0.36;   // loop → reel, after the grade has fully released
  const CTL  = 0.40;   // player chrome appears
  const HOLD = 0.76;   // the reel has had the frame; start closing
  const HDR_BACK = 0.90;  // header returns as the frame closes out

  // The master opens on a 4s black "Show Reel 26" slate, and the hero loop is
  // cut from SLATE onwards. Handing over at (loop position + SLATE) means the
  // image simply carries on, and the loop's 22 second cage opens into the whole
  // film instead of cutting to a title card.
  const SLATE = 4.2;
  const LOOP_LEN = 22;

  const barScale = () => {
    const vh = window.innerHeight;
    return 1 - Math.min(vh, window.innerWidth / 2.39) / vh;
  };

  gsap.set('.hero__bar', { scaleY: 0 });
  const words = $$('.hero__title .split__inner');

  // Scrubbed timeline, written in the same 0–1 units as the beats above.
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: sec, start: 'top top', end: 'bottom bottom',
      scrub: .55, invalidateOnRefresh: true,
    },
    defaults: { ease: 'power2.out' },
  });

  // 1 · The titles leave from the bottom up, so the name is the last thing
  //     to go. It masks upward through the same word slots it arrived in,
  //     which reads as the intro running backwards rather than a fade.
  tl.to('.hero__cue',  { opacity: 0, duration: .07 }, 0)
    .to('.heroReel',   { opacity: 0, y: 14, duration: .09 }, .02)
    .to('.hero__lede', { opacity: 0, y: -10, duration: .10 }, .06)
    .to(words.length ? words : '.hero__title',
        { yPercent: -105, duration: .15, stagger: .025, ease: 'power3.in' }, .12)

  // 2. The frame opens. Both of these must FINISH before SWAP: if the grade
  //     is still moving while the two videos cross-fade, they are different
  //     pictures for a moment and you see the seam.
    .to('.hero__scrim', { opacity: 0, duration: .16, ease: 'none' }, .17)
    .to(loop, { filter: 'saturate(1) contrast(1) brightness(1)', duration: .16, ease: 'none' }, .17)

  // 3 · The reel holds the frame. The swap itself is handled outside the
  //     scrub (see swap()), because it must wait for a decoded frame.
    .to({}, { duration: .43 }, .33)

  // 4 · Close to 2.39:1 and release into the films.
    .to('.hero__bar', { scaleY: barScale, duration: .24, ease: 'power2.inOut' }, HOLD);

  // Playback, the swap and the chrome are driven by position, not scrubbed.
  let armed = false;
  let synced = false;
  let showing = false;
  let shown = false;
  let want = false;

  // The crossfade is deliberately NOT on the scrubbed timeline. Scroll can
  // reach the swap point before the reel has decoded a frame, and fading to
  // an undecoded video is a black flash, the one thing that would give the
  // whole transition away. Instead it waits for readiness and then runs on
  // its own clock. Both videos share a crop, a grade and a timestamp by this
  // point, so what cross-fades are two copies of the same picture.
  const swap = (on) => {
    want = on;
    if (on === shown) return;
    if (on && reel.readyState < 2) return;      // not decoded yet; try again on canplay
    shown = on;
    gsap.to(reel, { opacity: on ? 1 : 0, duration: .5, ease: 'none', overwrite: 'auto' });
    gsap.to(loop, { opacity: on ? 0 : 1, duration: .5, ease: 'none', overwrite: 'auto' });
  };
  reel.addEventListener('canplay', () => swap(want));

  // Owns starting playback as well as the seek. Calling play() separately
  // races the seek: playback begins at 0 (on the slate) and the seek is
  // dropped while the media is still loading.
  const startReel = () => {
    if (synced) {
      if (reel.paused) reel.play().catch(() => {});
      return;
    }
    synced = true;
    const at = SLATE + ((loop && loop.currentTime) || 0) % LOOP_LEN;
    const go = () => {
      try { reel.currentTime = Math.min(at, (reel.duration || 60) - 1); } catch {}
      reel.play().catch(() => {});
    };
    if (reel.readyState >= 1) go();
    else reel.addEventListener('loadedmetadata', go, { once: true });
  };

  // Repeat without ever showing the slate again.
  reel.addEventListener('ended', () => {
    reel.currentTime = SLATE;
    reel.play().catch(() => {});
  });

  const setControls = (on) => {
    if (on === showing) return;
    showing = on;
    if (on) controls.hidden = false;
    gsap.to(controls, {
      opacity: on ? 1 : 0, duration: .35, ease: 'power2.out',
      // Hide only once faded, or the transition never gets to be seen.
      onComplete: () => { if (!on) controls.hidden = true; },
    });
    if (on) idle();
  };

  // Fade the header away while the reel has the frame, and take it out of the
  // tab order so focus cannot land on something invisible.
  let headerHidden = false;
  const setHeader = (hidden) => {
    if (hidden === headerHidden) return;
    headerHidden = hidden;
    gsap.to(hdr, { opacity: hidden ? 0 : 1, duration: .4 });
    hdr.inert = hidden;
  };

  let idleTimer;
  const idle = () => {
    clearTimeout(idleTimer);
    gsap.to(controls, { opacity: 1, duration: .25 });
    idleTimer = setTimeout(() => {
      if (showing && !controls.contains(document.activeElement)) {
        gsap.to(controls, { opacity: 0, duration: .5 });
      }
    }, 2600);
  };
  ['pointermove', 'keydown'].forEach((e) => window.addEventListener(e, () => showing && idle(), { passive: true }));

  ScrollTrigger.create({
    trigger: sec, start: 'top top', end: 'bottom bottom',
    onUpdate: ({ progress: p }) => {
      // If someone scrolls while the intro is still playing, finish it at
      // once rather than letting two timelines write the same properties.
      if (p > 0.004 && introTl && introTl.isActive()) introTl.progress(1).kill();

      // 13 MB file, so start fetching on intent, not on load, and switch to
      // eager buffering so a frame is ready well before SWAP.
      if (!armed && !frugal && p > ARM) {
        armed = true;
        reel.preload = 'auto';
        reel.src = 'assets/video/reel.mp4';
        reel.load();
      }

      // No upper bound on either: the reel must still be the picture while
      // the bars close over it. Reverting near the end flipped the frame back
      // to the loop at exactly the wrong moment. Playback stops on the way
      // out of the section instead (onLeave / onLeaveBack).
      if (p >= PLAY && !frugal) startReel();

      swap(!frugal && p >= SWAP);
      // No reel means no player chrome: a sound toggle for a film that is
      // not playing would be a control that does nothing.
      setControls(!frugal && p >= CTL && p < HOLD);
      setHeader(p >= HDR && p < HDR_BACK);
    },
    onLeave: () => reel.pause(),
    onEnter: () => { if (shown) reel.play().catch(() => {}); },
    // Back at the top the loop takes over again, so let the next pass
    // re-sync from wherever the loop has got to.
    onLeaveBack: () => { reel.pause(); synced = false; },
  });

  $('#reelSound').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    reel.muted = !reel.muted;
    btn.setAttribute('aria-pressed', String(!reel.muted));
    $('#reelSoundLabel').textContent = reel.muted ? 'Sound on' : 'Sound off';
    idle();
  });

  $('#reelSkip').addEventListener('click', () => {
    reel.pause();
    scrollTo($('#films'));
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) reel.pause(); });
}

/* ── header hide-on-scroll ────────────────────────────────── */
function headerBehaviour() {
  const hdr = $('#hdr');
  let last = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    const menuOpen = $('#burger')?.getAttribute('aria-expanded') === 'true';
    if (!menuOpen && y > 300 && y > last + 4) hdr.classList.add('is-hidden');
    else if (y < last - 4 || y < 300) hdr.classList.remove('is-hidden');
    // Past the hero the header sits over photographs and over the cream
    // contact block, so it carries its own background from here on.
    hdr.classList.toggle('is-solid', y > window.innerHeight * .8);
    last = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ── mobile menu ──────────────────────────────────────────── */
function mobileMenu() {
  const burger = $('#burger');
  const menu = $('#menu');
  if (!burger || !menu) return;

  const set = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    document.body.classList.toggle('is-locked', open);
    if (lenis) open ? lenis.stop() : lenis.start();
    if (open) $('a', menu)?.focus();
  };

  burger.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { set(false); burger.focus(); }
  });
}

/* ── smooth in-page links ─────────────────────────────────── */
function anchorLinks() {
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      scrollTo(target);
      history.replaceState(null, '', id);
    });
  });
}

/* ── deep links ───────────────────────────────────────────────
   The loader locks the body, so the browser's own jump to a #hash is
   lost. Re-apply it once the page is live, so a shared link to a
   section actually lands there. */
function deepLink() {
  const id = location.hash;
  if (!id || id.length < 2) return;
  const target = document.querySelector(id);
  if (!target) return;
  if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
  else target.scrollIntoView();

  // Lenis applies the jump on its next frame. Refreshing before that lands
  // leaves every ScrollTrigger measured against the old position, so the
  // reveals for the section we just jumped to never fire and it renders
  // blank. Re-measure once the scroll has actually happened.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ScrollTrigger?.refresh();
    ScrollTrigger?.update();
  }));
}

/* ── work grid ────────────────────────────────────────────── */
/* Repeating editorial templates. Each slot asks for an orientation and
   declares a column span + vertical drop, so the grid reads as a spread
   instead of a uniform contact sheet. Filled from orientation pools so
   tall frames land in tall slots whatever the active filter. */
const TEMPLATES = [
  [{ o: 'landscape', span: 7, drop: 0 }, { o: 'portrait', span: 4, drop: 1 }],
  [{ o: 'portrait', span: 3, drop: 0 }, { o: 'portrait', span: 3, drop: 1 }, { o: 'landscape', span: 5, drop: 0 }],
  [{ o: 'landscape', span: 5, drop: 1 }, { o: 'portrait', span: 4, drop: 0 }, { o: 'portrait', span: 3, drop: 2 }],
  [{ o: 'portrait', span: 4, drop: 0 }, { o: 'landscape', span: 8, drop: 1 }],
  [{ o: 'portrait', span: 3, drop: 1 }, { o: 'landscape', span: 4, drop: 0 }, { o: 'portrait', span: 4, drop: 2 }],
  [{ o: 'landscape', span: 6, drop: 0 }, { o: 'landscape', span: 5, drop: 1 }],
];

// The full set is long. Show a generous first run, then let people ask for
// the rest rather than making them scroll through all 52 to reach the footer.
const PAGE = 18;

function layout(items) {
  const pools = { portrait: [], landscape: [] };
  items.forEach((p) => pools[p.orient === 'portrait' ? 'portrait' : 'landscape'].push(p));

  const out = [];
  let t = 0;
  while (pools.portrait.length || pools.landscape.length) {
    const tpl = TEMPLATES[t++ % TEMPLATES.length];
    for (const slot of tpl) {
      const first = slot.o;
      const other = first === 'portrait' ? 'landscape' : 'portrait';
      const photo = pools[first].shift() || pools[other].shift();
      if (!photo) break;
      out.push({ photo, span: slot.span, drop: slot.drop });
    }
  }
  return out;
}

function cell({ photo, span, drop }, index) {
  const el = document.createElement('div');
  el.className = 'cell';
  el.dataset.span = String(span);
  if (drop) el.dataset.drop = String(drop);

  // `srcs` holds the widths this photograph actually has, ascending. Anything
  // it does not list does not exist on disk, so the srcset never asks the
  // browser to weigh up a file that isn't there. A single-variant frame gets
  // no srcset at all: there is nothing to choose between.
  const srcs = photo.srcs || [1200];
  const srcset = srcs.length > 1
    ? `srcset="${srcs.map((w) => `${photoSrc(photo.slug, w)} ${w}w`).join(', ')}"
          sizes="(max-width: 900px) 92vw, ${Math.round((span / 12) * 92)}vw"`
    : '';

  el.innerHTML = `
    <button class="cell__btn" data-index="${index}">
      <span class="cell__media" style="aspect-ratio:${photo.ratio};background-image:url('${photo.lqip}')">
        <img
          src="${photoSrc(photo.slug, srcs[0])}"
          ${srcset}
          alt="${photo.place}"
          width="${photo.w}" height="${photo.h}"
          loading="lazy" decoding="async" />
      </span>
    </button>`;

  const img = $('img', el);
  const mark = () => img.classList.add('is-loaded');
  img.complete ? mark() : img.addEventListener('load', mark, { once: true });
  return el;
}

let visible = [];
let shown = 0;

function paint(from) {
  const grid = $('#grid');
  const slots = layout(visible).slice(from, shown);
  const frag = document.createDocumentFragment();
  // `visible` is the lightbox's running order, so index against it.
  slots.forEach((slot) => frag.append(cell(slot, visible.indexOf(slot.photo))));
  grid.append(frag);

  const more = $('#gridMore');
  more.hidden = shown >= visible.length;

  ScrollTrigger?.refresh();
}

function renderGrid(cat) {
  visible = cat === 'all' ? PHOTOS.slice() : PHOTOS.filter((p) => p.cat === cat);
  shown = Math.min(PAGE, visible.length);
  $('#grid').innerHTML = '';
  $('#gridEmpty').hidden = visible.length > 0;
  paint(0);
}

function showMore() {
  const from = shown;
  shown = visible.length;
  paint(from);
}

function buildFilters() {
  const wrap = $('#filters');
  const counts = PHOTOS.reduce((m, p) => ((m[p.cat] = (m[p.cat] || 0) + 1), m), {});

  CATS.forEach(([key, label]) => {
    const n = key === 'all' ? PHOTOS.length : counts[key] || 0;
    if (!n) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(key === 'all'));
    b.dataset.cat = key;
    b.innerHTML = `${label}<i>${n}</i>`;
    b.addEventListener('click', () => {
      $$('button', wrap).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderGrid(key);
    });
    wrap.append(b);
  });
}

/* ── lightbox ─────────────────────────────────────────────── */
function lightbox() {
  const lb = $('#lb');
  const img = $('#lbImg');
  let i = 0;
  let opener = null;

  const paint = () => {
    const p = visible[i];
    if (!p) return;
    img.style.transition = 'none';
    img.style.transform = '';
    // The best this frame has, which is not always 2400.
    img.src = photoSrc(p.slug, (p.srcs || [1200]).at(-1));
    img.alt = p.place;
    $('#lbNote').textContent = p.cat;
    $('#lbCount').textContent = `${i + 1} / ${visible.length}`;
  };

  const open = (index, from) => {
    i = index; opener = from;
    lb.hidden = false;
    document.body.classList.add('is-locked');
    setBackgroundInert(true);
    lenis?.stop();
    paint();
    $('#lbClose').focus();
  };

  const close = () => {
    lb.hidden = true;
    document.body.classList.remove('is-locked');
    setBackgroundInert(false);
    lenis?.start();
    img.removeAttribute('src');
    opener?.focus();
  };

  const step = (d) => { i = (i + d + visible.length) % visible.length; paint(); };

  $('#grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cell__btn');
    if (btn) open(Number(btn.dataset.index), btn);
  });

  $('#lbClose').addEventListener('click', close);
  $('#lbPrev').addEventListener('click', () => step(-1));
  $('#lbNext').addEventListener('click', () => step(1));
  $$('[data-lb-close]').forEach((el) => el.addEventListener('click', close));

  /* Swipe. On a phone the chevrons are the only way through the set, which
     for a gallery is not enough. The frame follows the finger so the gesture
     has a visible consequence, then either advances or springs back.
     Mouse pointers are left alone: dragging a picture with a mouse is not a
     gesture anyone makes, and claiming pointer capture would break the
     click-to-close on the scrim. */
  const figure = $('.lb__figure');
  let sx = 0, sy = 0, dx = 0, tracking = false;

  const settle = (offset, ms) => {
    img.style.transition = ms ? `transform ${ms}ms cubic-bezier(.22,.61,.36,1)` : 'none';
    img.style.transform = offset ? `translateX(${offset}px)` : '';
  };

  figure.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    tracking = true; dx = 0;
    sx = e.clientX; sy = e.clientY;
    settle(0, 0);
  }, { passive: true });

  figure.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    const mx = e.clientX - sx;
    // A mostly-vertical drag is the browser's business, not ours.
    if (Math.abs(e.clientY - sy) > Math.abs(mx) * 1.2) { tracking = false; settle(0, 180); return; }
    dx = mx;
    if (!REDUCED) settle(dx * .45, 0);
  }, { passive: true });

  const release = () => {
    if (!tracking) return;
    tracking = false;
    const moved = dx;
    settle(0, 200);
    if (Math.abs(moved) > 44) step(moved < 0 ? 1 : -1);
    dx = 0;
  };

  figure.addEventListener('pointerup', release, { passive: true });
  figure.addEventListener('pointercancel', release, { passive: true });
  figure.addEventListener('pointerleave', release, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Tab') {
      // Keep focus inside the overlay while it's up.
      const f = $$('button', lb);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ── film player ──────────────────────────────────────────── */
/* Nothing from YouTube is requested until the visitor asks for the film,
   so the page carries no third-party weight or cookies on load. */
function filmPlayer() {
  const vp = $('#vp');
  const frame = $('#vpFrame');
  let opener = null;

  // Fullscreen belongs to the player. YouTube's iframe carries `allowfullscreen`
  // and the local reel is a <video controls>, so both already offer it exactly
  // where a viewer looks for it. Driving it a second time from our own button
  // meant two controls for one thing, and on iPhone the top one silently did
  // nothing: Safari there will only fullscreen a <video>, through its own method.

  const close = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    vp.hidden = true;
    frame.innerHTML = '';   // also stops a local <video> dead
    document.body.classList.remove('is-locked');
    setBackgroundInert(false);
    lenis?.start();
    const hero = $('#heroVideo');
    if (hero && !REDUCED && hero.getBoundingClientRect().bottom > 0) hero.play().catch(() => {});
    opener?.focus();
  };

  const open = (btn, markup, ratio = 16 / 9) => {
    opener = btn;
    vp.style.setProperty('--vp-ar', String(ratio));
    frame.innerHTML = markup;
    vp.hidden = false;
    document.body.classList.add('is-locked');
    setBackgroundInert(true);
    lenis?.stop();
    // Nothing should still be playing behind the overlay.
    $('#heroVideo')?.pause();
    $('#heroReelVideo')?.pause();
    // The overlay itself takes focus, so Escape reaches the handler below and
    // the first Tab lands in the player rather than back on the locked page.
    vp.focus();
  };

  // The two directed films live on YouTube.
  $$('[data-play]').forEach((btn) => {
    btn.addEventListener('click', () => open(btn,
      `<iframe src="https://www.youtube-nocookie.com/embed/${btn.dataset.play}?autoplay=1&rel=0&modestbranding=1"
               title="${btn.dataset.title}"
               allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
               allowfullscreen></iframe>`));
  });

  // The showreel is served from here, so it plays in the same overlay rather
  // than getting a section of its own that repeats the hero.
  $$('[data-play-local]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // The reel is 2.39:1; matching the frame to it avoids letterboxing
      // the letterbox.
      open(btn,
        `<video src="${btn.dataset.playLocal}" title="${btn.dataset.title}"
                controls autoplay playsinline
                poster="assets/video/reel-poster.jpg"></video>`,
        1920 / 804);
      $('video', frame)?.play().catch(() => {});
    });
  });

  $$('[data-vp-close]').forEach((el) => el.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (vp.hidden || e.key !== 'Escape') return;
    // In fullscreen the browser handles Escape itself. Closing here as well
    // tore the player down on the way back, so one press left you on the page
    // instead of back in the overlay.
    if (document.fullscreenElement) return;
    close();
  });
}

/* ── one-off content wiring ───────────────────────────────── */
function staticBits() {
  $('#year').textContent = String(new Date().getFullYear());

  const pick = (slug) => PHOTOS.find((p) => p.slug === slug);

  const q = pick('fluting');
  const qImg = $('#quietImg');
  if (q && qImg) {
    qImg.src = photoSrc(q.slug, (q.srcs || [1200]).at(-1));
    qImg.style.backgroundImage = `url('${q.lqip}')`;
    qImg.alt = q.place;
  }

  const a = pick('crossing');
  const aImg = $('#aboutImg');
  if (a && aImg) {
    aImg.src = photoSrc(a.slug, (a.srcs || [1200])[0]);
    aImg.style.backgroundImage = `url('${a.lqip}')`;
    aImg.alt = a.place;
  }
}

/* ── scroll focus ───────────────────────────── */
/* Scroll with the cursor resting on a frame and that frame grows. It keeps
   tracking the pointer as the grid slides past, so the enlarged frame is
   always the one being looked at, and eases back a moment after the scroll
   stops. Reads the element under the pointer rather than using :hover so it
   still updates when the page moves under a stationary mouse. */
function scrollFocus() {
  if (REDUCED) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let px = -1;
  let py = -1;
  let current = null;
  let queued = false;
  let idle = 0;

  const release = () => {
    if (!current) return;
    current.classList.remove('is-focus');
    current = null;
  };

  const focus = (el) => {
    if (el === current) return;
    if (current) current.classList.remove('is-focus');
    current = el;
    if (el) el.classList.add('is-focus');
  };

  const measure = () => {
    queued = false;
    if (px < 0) return;
    // The scaled frame is itself under the pointer, so hit-testing simply
    // returns it again, so no flicker between the grown and normal state.
    const hit = document.elementFromPoint(px, py);
    focus(hit ? hit.closest('.cell') : null);
  };

  window.addEventListener('pointermove', (e) => {
    px = e.clientX;
    py = e.clientY;
  }, { passive: true });

  // A pointer that has left the window leaves stale coordinates behind.
  document.addEventListener('pointerleave', () => { px = py = -1; release(); });

  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(measure); }
    clearTimeout(idle);
    idle = setTimeout(release, 420);
  }, { passive: true });
}

/* ── boot ─────────────────────────────────────────────────── */
(async function boot() {
  staticBits();
  buildFilters();
  renderGrid('all');
  $('#gridMore').addEventListener('click', showMore);
  heroVideo();
  mobileMenu();
  headerBehaviour();
  lightbox();
  filmPlayer();
  scrollFocus();

  const motion = await loadMotion();
  if (!motion) {
    // GSAP never arrived (offline, blocked CDN, reduced motion). The CSS
    // start states are only safe while something is going to animate them
    // away, so clear them here or the media stays invisible for good.
    $$('[data-reveal]').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }
  await startLenis();
  anchorLinks();

  heroIntro();
  choreograph();
  heroTakeover();
  ScrollTrigger?.refresh();
  deepLink();

  // Fonts change metrics; re-measure once they've settled.
  document.fonts?.ready.then(() => ScrollTrigger?.refresh());

  window.addEventListener('pagehide', () => {
    lenis?.destroy();
    ScrollTrigger?.getAll().forEach((t) => t.kill());
  });
})();
