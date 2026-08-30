Third-party motion libraries, vendored so the site has no runtime dependency
on a CDN. Nothing here is edited by hand.

    gsap 3.12.5   https://cdn.jsdelivr.net/npm/gsap@3.12.5/
                  index.js, gsap-core.js, CSSPlugin.js,
                  Observer.js, ScrollTrigger.js
    lenis 1.1.14  https://cdn.jsdelivr.net/npm/lenis@1.1.14/dist/lenis.mjs

The gsap files import each other by relative path, so the directory layout
has to stay as it is. To upgrade, re-download the same file list at the new
version and bump the paths in `LIB` at the top of `js/main.js` if they moved.
