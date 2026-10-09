/* =============================================================================
   Jaseela KV — portfolio · script.js
   Classic script (no modules, no libraries, no fetch) so it works from file:// and from a host.

   TABLE OF CONTENTS
     1. ENGINE CONTRACT ........ (this comment) read before touching anything
     2. Utilities / math helpers
     3. Environment ............ motion-ok switch, pointer capability, viewport
     4. Scene registry ......... Scenes.add(name, definition)
     5. Geometry cache ......... measure()
     6. Frame loop ............. one passive scroll listener -> one rAF -> writes
     7. Reveal-on-enter ........ [data-reveal]
     8. Global UI .............. theme toggle (view transition), mobile menu, active link + sliding pill
     9. Pointer niceties ....... [data-tilt] [data-magnetic] [data-spotlight] + hero / contact pointer parallax
    10. Scene: hero
    11. Scene: statement
    12. Scene: overview ........ count-ups
    13. Scene: skills .......... stepper, pose, screens, rail
    14. Scene: experience ...... drawn spine, node fill, reached roles
    15. Scene: projects ........ horizontal shelf: drag, keys, buttons, dots, parallax feed
    16. Scene: marquee ......... repeats the pills (the motion itself is CSS maths from --p)
    17. Scene: contact ......... word split, armed state, keyboard focus
    18. Boot ................... motion switch, resize/orientation/fonts/print handling, intro trigger

   -----------------------------------------------------------------------------
   1. ENGINE CONTRACT
   -----------------------------------------------------------------------------
   MOTION SWITCH
     <html class="motion-ok"> turns every scroll-driven behaviour on. It is decided
       (a) in the inline <head> script before first paint and (b) here, kept in sync on
       matchMedia(prefers-reduced-motion) change, resize, orientationchange and print (beforeprint/afterprint).
       Rule: !prefers-reduced-motion && innerWidth >= 360 && innerHeight >= 520 && !printing.
     Without it (reduced motion, tiny landscape phone, no JS, print) the page is the plain static layout and the
       engine does NOT write --p / data-state (it still runs header tone, tight state, active link, reveal, counters).
     <html class="is-ready"> = the page-load intro may play (added after fonts.ready, max 900 ms; the head timer is a failsafe).
     <html class="js"> = JavaScript is available.   <html class="theme-switching"> = theme view transition running.

   SCENES (DOM)
     <section class="scene [scene--pinned|scene--flow] [scene--dark]" data-scene="NAME" id="…">
     Pinned scene: class scene--pinned, inline  style="--len:240;--len-m:180"  (--len = TOTAL wrapper height in svh
       including the 100svh stage; --len-m replaces it at <= 860px) and ONE direct child
       <div class="scene__stage"> (position:sticky; top:0; height:100svh; overflow:clip; contain:layout paint).
       The pin lasts (--len - 100) svh of scrolling. Never put overflow other than visible/clip on an ancestor of a stage.
     Flow scene: ordinary section, no stage. Anything that must not clip stays outside .scene__stage.
     Every top-level <section> inside <main> is also a "zone": it feeds the header tone and the nav scrollspy, and
     anchor links land with the section's top edge at the very top of the viewport (CSS: main > section scroll-margin-top).

   WHAT THE ENGINE WRITES (only while html.motion-ok; ONE rAF loop, fed by ONE passive scroll listener)
     --p         on the scene element, 0..1, a PURE FUNCTION of scrollY (no smoothing, no time):
                 pinned: (scrollY - top) / (height - stageHeight);
                 flow:   0 when the scene's top reaches the viewport bottom, 1 when its bottom leaves the viewport top.
     data-state  on the scene element: "before" (p = 0) | "active" (0 < p < 1) | "after" (p = 1).
     .is-near    class on the scene element while it is within ~1 viewport of the screen. Gate will-change on it:
                 .motion-ok .is-near .thing { will-change: transform }   (it is removed again when the scene is far away)
     Far-away scenes are PARKED at their final value (0 before / 1 after); their update() runs once more with that
     value, so anchor jumps, scrollbar drags and history restoration always render correctly.
     --page-progress  on <html>, 0..1 (header hairline). It is a registered NON-inherited property (see styles.css):
                 children that need it say  --page-progress: inherit  (body, .site-header, .site-header::after do).
     Header: .is-tight after the first ~12px of scroll; data-tone="light|dark" = tone of the zone under the header bar
     (.scene--dark / .tone-dark sections are dark; a scene def may provide tone(p), the hero does).
     Nav: aria-current="true" on the link whose section is under the viewport centre; the pill is moved with
     --pill-x / --pill-s / --pill-base on #site-nav (transform only; measured once per re-measure).

   REGISTERING SCENE LOGIC
     Scenes.add('skills', {
       init(el, ctx)            once at boot. Query children, split text, attach listeners. May read layout.
                                Do not assume motion is on (see enable / disable).
       measure(el, ctx, sc)     optional. After EVERY geometry re-measure (load, resize, orientationchange, ResizeObserver,
                                fonts.ready, motion switch). READ layout here and cache numbers on your own object
                                (sc.top / sc.h / sc.range / sc.stageH are available). Never write styles in measure().
       update(el, p, ctx, sc)   optional. Called from the rAF loop only when p (rounded to 1e-4) changed while the scene is
                                near, once with 0/1 when it parks, and once after every measure. MUST NOT read layout
                                (no offset*, getBoundingClientRect, getComputedStyle, scrollY). Write only transform /
                                opacity / custom properties / classes, and skip redundant writes.
       enable(el, ctx)          optional. motion-ok turned ON (also once at boot when on).
       disable(el, ctx)         optional. motion-ok turned OFF: clear every inline style/class you wrote.
       tone(p)                  optional. 'dark' | 'light' = tone under the header bar at that progress.
     })
     ctx (one shared object, also window.Engine.ctx):
       math     clamp(v, lo=0, hi=1)  lerp(a, b, t)  seg(p, a, b) = clamp((p-a)/(b-a))  map(v, inA, inB, outA, outB)
                smoothstep(a, b, v)   easeIn / easeOut / easeInOut / easeInOutSine / easeOutExpo (t)   fmt(n, decimals=4)
       state    ctx.env = { vw, vh, motion, fine, printing }   (live; fine = hover:hover + pointer:fine + motion-ok)
       lookup   ctx.scene(name) -> record { el, name, pinned, top, h, range, stageH, p, state, mode }
                ctx.yFor(name, p) -> absolute scrollY at which the scene's --p equals p (pinned and flow)
       util     ctx.all(sel, root) -> Array;  ctx.requestMeasure();  ctx.requestTick();  ctx.reveal(el)
     window.Engine = { ctx, Scenes, env, measure(), tick() }  (handy in DevTools and in probe.mjs)

   SCRUB MATHS IN CSS (preferred): the scene inherits --p, so
       --t: clamp(0, calc((var(--p, 0) - 0.1) / 0.3), 1);       (segment 0.1 .. 0.4)
       --t-e: calc(var(--t) * var(--t) * (3 - 2 * var(--t)));    (smoothstep)
       transform: translate3d(0, calc((1 - var(--t-e)) * 40px), 0);  opacity: var(--t-e);
     Always give var(--p, 0) a fallback. Never put a CSS transition on a property that is being scrubbed.
     Per-frame custom properties inherit into every descendant: keep big decorative subtrees out of it
     (e.g. .phone-pose declares  --p: initial).  Do not transform SVG children in motion: it forces a layout per frame
     (put the transform on the <svg> root or an HTML wrapper).

   SKILLS SCREEN CONTRACT (so independently produced art plugs in; identical to kit/NOTES.md)
     Each screen: <div class="screen screen--NAME" data-screen="i" aria-hidden="true"> inside .phone__screen.
     Order/names: 0 ads, 1 market, 2 web, 3 seo, 4 tools, 5 style. Step i owns p in [i/N, (i+1)/N].
     The engine sets on every .screen:  .is-active (current step)
       --v  own animation progress = clamp((p*N - i) / 0.6, 0, 1)   (1 once its step has passed)
       --s  presence for the cross-fade, SYMMETRIC, W = 0.06, q = p*N:
            incoming 0 -> 1 across q in (i - W, i + W); outgoing 1 -> 0 across q in (i + 1 - W, i + 1 + W).
            Screen 0 starts at 1, the last screen never falls. The CSS (.phone__screen > .screen) does the dissolve.
     The 3D pose (rotateY -18 -> 0 over the first 6% of p, subtle p-linked float, out over the last 6%) is written on
     the [data-pose] wrapper (.phone-pose), never on .phone. Rail dots scroll to (i + 0.65) / N of the pin.
     Screens animate only transform / opacity / stroke-dashoffset / stroke-dasharray / clip-path from var(--v, 1).

   REVEAL-ON-ENTER  [data-reveal="" | rise | left | scale | fade]  [data-reveal-delay="ms"]
     IntersectionObserver adds .is-in once. CSS hides them only under .motion-ok (visible without JS / motion).
     Do not put [data-reveal] and [data-tilt] on the same element (both use transform).

   POINTER NICETIES (only when (hover:hover) and (pointer:fine) and motion-ok; touch gets none of them)
     [data-tilt]       perspective tilt <= 6deg + glare (--rx --ry --gx --gy, class .is-tilting); glare span is injected.
     [data-magnetic]   pulls <= 10px toward the pointer within ~80px (uses the individual `translate` property).
     [data-spotlight]  disc follows the pointer inside the element (--mx --my, class .is-lit).
     Hero parallax: --ptx / --pty (-1..1) written on the hero scene while the pointer moves.

   PERFORMANCE RULES
     One rAF loop; it goes idle when scrolling stops. Geometry is cached by measure(); the frame never reads layout
     and never interleaves reads with writes. Animate transform/opacity only. will-change only on .is-near.
     Measured on desktop 1440x900 (headless): ~0.06 ms script and ~1.1 ms style per frame while scrolling.
   ============================================================================= */
(function () {
  'use strict';

  var root = document.documentElement;
  var NEAR = 1;               // scenes within NEAR viewports of the screen are "near" (updated every frame)
  var HEADER_H = 68;          // = --header-h in styles.css
  var REST = 0.65;            // skills: where inside a step's span the rail dots scroll to (--v is 1, clear of both cross-fades)

  /* ===========================================================================
     2. UTILITIES
     =========================================================================== */
  function clamp(v, lo, hi) {
    if (lo === undefined) lo = 0;
    if (hi === undefined) hi = 1;
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }
  function map(v, inA, inB, outA, outB) { return lerp(outA, outB, seg(v, inA, inB)); }
  function smoothstep(a, b, v) { var t = seg(v, a, b); return t * t * (3 - 2 * t); }
  function easeIn(t) { return t * t * t; }
  function easeOut(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function fmt(n, d) { var m = Math.pow(10, d === undefined ? 4 : d); return String(Math.round(n * m) / m); }
  function all(sel, from) { return Array.prototype.slice.call((from || document).querySelectorAll(sel)); }
  function onMQ(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  /* ===========================================================================
     3. ENVIRONMENT
     =========================================================================== */
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var mqPrint = window.matchMedia ? window.matchMedia('print') : null;
  var env = { vw: 0, vh: 0, motion: false, fine: false, printing: false };

  function motionAllowed() {
    return !mqReduce.matches && !env.printing && window.innerWidth >= 360 && window.innerHeight >= 520;
  }

  /* ===========================================================================
     4. SCENE REGISTRY
     =========================================================================== */
  var scenes = [];            // scene records in document order
  var byName = {};
  var zones = [];             // tone / scrollspy zones (main > section, footer)
  var booted = false;

  var Scenes = {
    defs: {},
    list: scenes,
    add: function (name, def) {
      this.defs[name] = def;
      if (booted && byName[name]) { byName[name].def = def; if (def.init) def.init(byName[name].el, ctx); }
    },
    get: function (name) { return byName[name]; }
  };

  var ctx = {
    clamp: clamp, lerp: lerp, seg: seg, map: map, smoothstep: smoothstep,
    easeIn: easeIn, easeOut: easeOut, easeInOut: easeInOut, easeInOutSine: easeInOutSine, easeOutExpo: easeOutExpo,
    fmt: fmt, all: all, env: env, Scenes: Scenes,
    scene: function (name) { return byName[name]; },
    yFor: function (name, p) {
      var sc = byName[name];
      if (!sc) return 0;
      p = clamp(p);
      return Math.round(sc.pinned ? sc.top + sc.range * p : sc.top - env.vh + (sc.h + env.vh) * p);
    },
    requestMeasure: function () { needMeasure = true; requestTick(); },
    requestTick: function () { forceAll = true; requestTick(); },
    dirty: function (name) { var sc = byName[name]; if (sc) { sc.dirty = true; requestTick(); } },
    reveal: function (el) { observeReveal(el); }
  };

  /* ===========================================================================
     5. GEOMETRY CACHE  (all layout reads happen here, never inside the frame)
     =========================================================================== */
  var geo = { maxY: 1 };
  var pointerStale = false;   // set by the projects shelf when it scrolls: the hovered tilt card must be measured again
  var navMetrics = [];
  var navBase = 0;
  var navDirty = false;

  function measure() {
    var sy = window.pageYOffset || 0;
    var i, r, sc, z;
    env.vw = root.clientWidth || window.innerWidth;
    env.vh = window.innerHeight;

    for (i = 0; i < scenes.length; i++) {
      sc = scenes[i];
      r = sc.el.getBoundingClientRect();
      sc.top = r.top + sy;
      sc.h = r.height;
      sc.pinned = env.motion && sc.isPinned;
      if (sc.pinned) {
        sc.stageH = sc.stage.offsetHeight;
        sc.range = Math.max(1, sc.h - sc.stageH);
      } else {
        sc.stageH = sc.h;
        sc.range = Math.max(1, sc.h);
      }
      if (sc.def && sc.def.measure) sc.def.measure(sc.el, ctx, sc);
    }
    for (i = 0; i < zones.length; i++) {
      z = zones[i];
      r = z.el.getBoundingClientRect();
      z.top = r.top + sy;
      z.h = r.height;
    }
    geo.maxY = Math.max(1, root.scrollHeight - env.vh);
    measureNav();
  }

  function measureNav() {
    if (!navLinks.length || !pill || env.vw <= 860) return;
    var base = 0, i, w;
    navMetrics = [];
    for (i = 0; i < navLinks.length; i++) {
      w = navLinks[i].offsetWidth;
      if (w > base) base = w;
      navMetrics.push({ x: navLinks[i].offsetLeft, w: w, s: 1 });
    }
    for (i = 0; i < navMetrics.length; i++) navMetrics[i].s = base ? navMetrics[i].w / base : 1;
    navBase = base;
    navDirty = true;
  }

  /* ===========================================================================
     6. FRAME LOOP
     =========================================================================== */
  var rafId = 0;
  var needMeasure = false;
  var forceAll = true;
  var lastPP = -1;
  var tightState = null;
  var toneState = '';
  var linkState = -2;

  function requestTick() { if (!rafId) rafId = window.requestAnimationFrame(tick); }

  function tick() {
    rafId = 0;
    if (needMeasure) { needMeasure = false; measure(); forceAll = true; }
    var y = window.pageYOffset || 0;
    if (y < 0) y = 0;
    var vh = env.vh;
    var i;

    if (env.motion) {
      for (i = 0; i < scenes.length; i++) updateScene(scenes[i], y, vh);
    }
    updateGlobals(y, vh);
    forceAll = false;
  }

  function updateScene(sc, y, vh) {
    var lo = sc.top - vh * NEAR;
    var hi = sc.top + sc.h + vh * NEAR;
    var mode, p;
    var dirty = sc.dirty;                                          // ctx.dirty(name): the scene has input of its own
    sc.dirty = false;
    if (y < lo) { mode = 0; p = 0; }
    else if (y > hi) { mode = 2; p = 1; }
    else {
      mode = 1;
      p = sc.pinned ? clamp((y - sc.top) / sc.range) : clamp((y + vh - sc.top) / (sc.h + vh));
    }
    if (!forceAll && !dirty && mode !== 1 && mode === sc.mode) return;       // parked and unchanged
    var pr = Math.round(p * 10000) / 10000;
    if (!forceAll && !dirty && mode === sc.mode && pr === sc.p) return;      // nothing changed

    var el = sc.el;
    if (mode !== sc.mode || forceAll) {
      sc.mode = mode;
      if (mode === 1) el.classList.add('is-near'); else el.classList.remove('is-near');
    }
    if (pr !== sc.p || forceAll || dirty) {
      sc.p = pr;
      el.style.setProperty('--p', String(pr));
      var state = pr <= 0 ? 'before' : (pr >= 1 ? 'after' : 'active');
      if (state !== sc.state) { sc.state = state; el.setAttribute('data-state', state); }
      if (sc.def && sc.def.update) sc.def.update(el, pr, ctx, sc);
    }
  }

  function updateGlobals(y, vh) {
    var i, z;

    // page progress hairline
    var pp = clamp(y / geo.maxY);
    pp = Math.round(pp * 10000) / 10000;
    if (pp !== lastPP) { lastPP = pp; root.style.setProperty('--page-progress', String(pp)); }

    // header: tight after first scroll
    var tight = y > 12;
    if (tight !== tightState) { tightState = tight; header.classList.toggle('is-tight', tight); }

    if (navDirty && pill) {
      navDirty = false;
      nav.style.setProperty('--pill-base', navBase + 'px');
      linkState = -2;       // re-place the pill
    }

    // tone under the header bar + active link at the viewport centre
    var probe = y + 30;
    var mid = y + vh * 0.5;
    var tone = 'light';
    var link = -1;
    for (i = 0; i < zones.length; i++) {
      z = zones[i];
      if (probe >= z.top && probe < z.top + z.h) {
        tone = (env.motion && z.sc && z.sc.def && z.sc.def.tone) ? z.sc.def.tone(z.sc.p < 0 ? 0 : z.sc.p) : (z.dark ? 'dark' : 'light');
      }
      if (mid >= z.top && mid < z.top + z.h) link = z.link;
    }
    if (tone !== toneState) { toneState = tone; header.setAttribute('data-tone', tone); }
    if (link !== linkState) { setActiveLink(link); }
  }

  /* ===========================================================================
     7. REVEAL-ON-ENTER
     =========================================================================== */
  var revealIO = null;

  function observeReveal(el) {
    if (!revealIO) { el.classList.add('is-in'); return; }
    revealIO.observe(el);
  }

  function initReveal() {
    var els = all('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-in'); }); return; }
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var t = entry.target;
        var d = parseInt(t.getAttribute('data-reveal-delay') || '0', 10);
        if (d) t.style.transitionDelay = d + 'ms';
        t.classList.add('is-in');
        revealIO.unobserve(t);
        if (d) window.setTimeout(function () { t.style.transitionDelay = ''; }, d + 1400);
      });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.1 });
    els.forEach(function (el) { revealIO.observe(el); });
  }

  /* ===========================================================================
     8. GLOBAL UI
     =========================================================================== */
  var header = document.getElementById('site-header');
  var nav = document.getElementById('site-nav');
  var navToggle = document.getElementById('nav-toggle');
  var themeToggle = document.getElementById('theme-toggle');
  var pill = nav ? nav.querySelector('.nav-pill') : null;
  var navLinks = nav ? all('a[href^="#"]', nav) : [];

  /* ---- theme ---- */
  function applyTheme(theme) {
    root.dataset.theme = theme;
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#15110e' : '#faf7f2');
  }

  function initTheme() {
    applyTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');

    themeToggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      var commit = function () {
        applyTheme(next);
        try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
      };
      if (!document.startViewTransition || mqReduce.matches) { commit(); return; }

      var r = themeToggle.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      root.classList.add('theme-switching');
      var vt;
      try { vt = document.startViewTransition(commit); } catch (e) { root.classList.remove('theme-switching'); commit(); return; }
      vt.ready.then(function () {
        root.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      vt.finished.then(function () { root.classList.remove('theme-switching'); }, function () { root.classList.remove('theme-switching'); });
    });
  }

  /* ---- mobile menu ---- */
  function setMenu(open) {
    header.classList.toggle('nav-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  function initMenu() {
    navToggle.addEventListener('click', function () {
      setMenu(!header.classList.contains('nav-open'));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) {
        setMenu(false);
        navToggle.focus();
      }
    });
    // a tap/click outside the open menu closes it
    document.addEventListener('click', function (event) {
      if (header.classList.contains('nav-open') && !event.target.closest('.site-header')) setMenu(false);
    });
  }

  /* ---- active link + sliding pill ---- */
  function setActiveLink(idx) {
    linkState = idx;
    var i;
    for (i = 0; i < navLinks.length; i++) {
      if (i === idx) navLinks[i].setAttribute('aria-current', 'true');
      else navLinks[i].removeAttribute('aria-current');
    }
    if (!pill) return;
    var m = navMetrics[idx];
    if (idx < 0 || !m) { pill.classList.remove('is-on'); return; }
    var wasOn = pill.classList.contains('is-on');
    if (!wasOn) pill.classList.add('is-snap');
    nav.style.setProperty('--pill-x', fmt(m.x, 1) + 'px');
    nav.style.setProperty('--pill-s', fmt(m.s, 4));
    if (!wasOn) {
      pill.classList.add('is-on');
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { pill.classList.remove('is-snap'); });
      });
    }
  }

  /* ===========================================================================
     9. POINTER NICETIES  (fine pointers + motion-ok only; touch gets none of this)
     =========================================================================== */
  function initPointer() {
    var magEls = all('[data-magnetic]').map(function (el) { return { el: el, tx: 0, ty: 0 }; });
    // scenes whose --ptx / --pty (-1..1) follow the pointer while they are on screen (and `live` says so)
    var parallax = [['hero', function (sc) { return sc.p < 0.55; }], ['contact', function () { return true; }]]
      .filter(function (a) { return byName[a[0]]; })
      .map(function (a) { return { sc: byName[a[0]], live: a[1], x: 0, y: 0 }; });

    function ensureGlare(el) {
      if (el.__glare) return;
      el.__glare = true;
      var g = document.createElement('span');
      g.className = 'tilt__glare';
      g.setAttribute('aria-hidden', 'true');
      el.appendChild(g);
    }

    var px = 0, py = 0, target = null, hovered = null, hRect = null, hSX = 0, hSY = 0, ptRaf = 0, inside = false;

    function release(el) {
      if (!el) return;
      el.classList.remove('is-lit', 'is-tilting');
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
    }

    function run() {
      ptRaf = 0;
      if (!env.fine) { resetAll(); return; }
      var sx = window.pageXOffset, sy = window.pageYOffset;      // reads first
      var i, m, r;

      var next = target && target.closest ? target.closest('[data-tilt],[data-spotlight]') : null;
      if (next !== hovered) {
        release(hovered);
        hovered = next;
        hRect = hovered ? hovered.getBoundingClientRect() : null;
        hSX = sx; hSY = sy;
      } else if (pointerStale && hovered) {          // the shelf scrolled under the pointer: measure the card again
        hRect = hovered.getBoundingClientRect();
        hSX = sx; hSY = sy;
      }
      pointerStale = false;
      var mrects = [];
      for (i = 0; i < magEls.length; i++) mrects.push(magEls[i].el.getBoundingClientRect());

      // writes
      if (hovered && hRect) {
        var lx = px - (hRect.left - (sx - hSX));
        var ly = py - (hRect.top - (sy - hSY));
        var nx = clamp(lx / hRect.width), ny = clamp(ly / hRect.height);
        if (hovered.hasAttribute('data-spotlight')) {
          hovered.style.setProperty('--mx', fmt(lx, 1) + 'px');
          hovered.style.setProperty('--my', fmt(ly, 1) + 'px');
          hovered.classList.add('is-lit');
        }
        if (hovered.hasAttribute('data-tilt')) {
          ensureGlare(hovered);
          hovered.classList.add('is-tilting');
          hovered.style.setProperty('--rx', fmt((0.5 - ny) * 12, 2) + 'deg');
          hovered.style.setProperty('--ry', fmt((nx - 0.5) * 12, 2) + 'deg');
          hovered.style.setProperty('--gx', fmt(lx, 1) + 'px');
          hovered.style.setProperty('--gy', fmt(ly, 1) + 'px');
        }
      }
      // parallax scenes: follow the pointer while on screen, ease back to 0 otherwise (CSS transitions do the easing)
      for (i = 0; i < parallax.length; i++) {
        var pr = parallax[i];
        var live = inside && pr.sc.mode === 1 && pr.live(pr.sc);
        var nx2 = live ? Math.round(((px / env.vw) - 0.5) * 200) / 100 : 0;
        var ny2 = live ? Math.round(((py / env.vh) - 0.5) * 200) / 100 : 0;
        if (nx2 !== pr.x || ny2 !== pr.y) {
          pr.x = nx2; pr.y = ny2;
          pr.sc.el.style.setProperty('--ptx', String(nx2));
          pr.sc.el.style.setProperty('--pty', String(ny2));
        }
      }
      for (i = 0; i < magEls.length; i++) {
        m = magEls[i];
        r = mrects[i];
        var cx = r.left + r.width / 2 - m.tx;
        var cy = r.top + r.height / 2 - m.ty;
        var dx = px - cx, dy = py - cy;
        var ex = Math.max(Math.abs(dx) - r.width / 2, 0);
        var ey = Math.max(Math.abs(dy) - r.height / 2, 0);
        var d = Math.sqrt(ex * ex + ey * ey);
        var tx = 0, ty = 0;
        if (inside && d < 80) {
          var k = (1 - d / 80) * 0.32;
          tx = dx * k; ty = dy * k;
          var len = Math.sqrt(tx * tx + ty * ty);
          if (len > 10) { tx = tx / len * 10; ty = ty / len * 10; }
        }
        if (Math.abs(tx - m.tx) > 0.05 || Math.abs(ty - m.ty) > 0.05) {
          m.tx = tx; m.ty = ty;
          m.el.style.translate = fmt(tx, 1) + 'px ' + fmt(ty, 1) + 'px';
          if (tx || ty) m.el.classList.add('is-magnet'); else m.el.classList.remove('is-magnet');
        }
      }
    }

    function resetAll() {
      release(hovered);
      hovered = null;
      parallax.forEach(function (pr) {
        if (pr.x || pr.y) {
          pr.x = 0; pr.y = 0;
          pr.sc.el.style.removeProperty('--ptx');
          pr.sc.el.style.removeProperty('--pty');
        }
      });
      magEls.forEach(function (m) {
        if (m.tx || m.ty) { m.tx = 0; m.ty = 0; m.el.style.translate = '0px 0px'; }
        m.el.classList.remove('is-magnet');
      });
    }

    document.addEventListener('pointermove', function (e) {
      if (!env.fine || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
      px = e.clientX; py = e.clientY; target = e.target; inside = true;
      if (!ptRaf) ptRaf = window.requestAnimationFrame(run);
    }, { passive: true });

    root.addEventListener('mouseleave', function () {
      inside = false; target = null;
      if (!ptRaf) ptRaf = window.requestAnimationFrame(run);
    });
  }

  /* ===========================================================================
     10. SCENE: HERO
     =========================================================================== */
  Scenes.add('hero', {
    init: function (el) {
      this.stage = el.querySelector('.scene__stage');
      this.orbWrap = el.querySelector('.hero__orbwrap');
      this.dx = 0; this.dy = 0; this.dirty = true;
      this.out = false; this.gone = false;
    },
    measure: function (el, ctx) {
      // READ ONLY: untransformed centre of the orb relative to the stage, via offset* (ignores transforms)
      var n = this.orbWrap, stage = this.stage;
      if (!n || !stage || !ctx.env.motion) return;
      var x = n.offsetWidth / 2, y = n.offsetHeight / 2, o = n, guard = 0;
      while (o && o !== stage && guard++ < 8) { x += o.offsetLeft; y += o.offsetTop; o = o.offsetParent; }
      var cx = stage.clientWidth / 2;
      var cy = (stage.clientHeight + HEADER_H) / 2;     // centre of the area below the header
      this.dx = ctx.env.vw > 860 ? cx - x : 0;
      this.dy = cy - y;
      if (ctx.env.vw <= 860) this.dy = Math.max(0, this.dy) * 0.9;
      this.dirty = true;
    },
    update: function (el, p) {
      if (this.dirty) {
        this.dirty = false;
        el.style.setProperty('--orb-dx', ctxFmt(this.dx) + 'px');
        el.style.setProperty('--orb-dy', ctxFmt(this.dy) + 'px');
      }
      var out = p > 0.26, gone = p > 0.46;
      if (out !== this.out) { this.out = out; el.classList.toggle('is-out', out); }
      if (gone !== this.gone) { this.gone = gone; el.classList.toggle('is-gone', gone); }
    },
    disable: function (el) {
      el.classList.remove('is-out', 'is-gone');
      el.style.removeProperty('--orb-dx');
      el.style.removeProperty('--orb-dy');
      this.out = this.gone = false;
      this.dirty = true;
    },
    tone: function (p) { return p > (env.vw > 860 ? 0.74 : 0.84) ? 'dark' : 'light'; }
  });
  function ctxFmt(n) { return fmt(n, 1); }

  /* ===========================================================================
     11. SCENE: STATEMENT  (words light up as a soft wave; the maths is in CSS, JS only assigns --s)
     =========================================================================== */
  // Wraps every word of `para` in <span class="w" style="--s:start"> (nested elements such as <span class="key"> keep
  // working; punctuation that directly follows an element joins the previous word). The starts are spread over
  // from .. to - soft, so the last word finishes exactly at `to`; CSS reads --s and --soft.
  function splitWords(para, from, to, soft) {
    var words = [];
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (kid) {
        if (kid.nodeType === 3) {
          var parts = kid.nodeValue.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part, idx) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            if (idx === 0 && words.length && kid.previousSibling && kid.previousSibling.nodeType === 1) {
              words[words.length - 1].appendChild(document.createTextNode(part));
              return;
            }
            var s = document.createElement('span');
            s.className = 'w';
            s.textContent = part;
            words.push(s);
            frag.appendChild(s);
          });
          node.replaceChild(frag, kid);
        } else if (kid.nodeType === 1) {
          walk(kid);
        }
      });
    })(para);

    var n = words.length;
    para.style.setProperty('--soft', String(soft));
    words.forEach(function (w, i) {
      w.style.setProperty('--s', fmt(from + (to - from - soft) * (n > 1 ? i / (n - 1) : 0), 4));
    });
    return words;
  }

  Scenes.add('statement', {
    init: function (el) {
      var para = el.querySelector('[data-statement]');
      if (para) splitWords(para, 0.12, 0.86, 0.16);
    }
  });

  /* ===========================================================================
     12. SCENE: OVERVIEW  (count-ups run once, ~1.2s, easeOut)
     =========================================================================== */
  Scenes.add('overview', {
    init: function (el) {
      var self = this;
      this.counters = all('[data-count]', el).map(function (n) {
        var tile = n.closest('.tile');
        return {
          el: n, tile: tile,
          to: parseInt(n.getAttribute('data-count'), 10) || 0,
          pips: tile ? all('.pips i', tile) : [],
          done: false, running: false, shown: -1
        };
      });
      if ('IntersectionObserver' in window) {
        this.io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            var c = self.find(entry.target);
            self.io.unobserve(entry.target);
            if (c) self.run(c);
          });
        }, { threshold: 0.55 });
        this.counters.forEach(function (c) { if (c.tile) self.io.observe(c.tile); });
      }
    },
    find: function (tile) {
      for (var i = 0; i < this.counters.length; i++) if (this.counters[i].tile === tile) return this.counters[i];
      return null;
    },
    show: function (c, v) {
      if (v === c.shown) return;
      c.shown = v;
      c.el.textContent = String(v);
      for (var i = 0; i < c.pips.length; i++) c.pips[i].classList.toggle('is-lit', i < v);
    },
    run: function (c) {
      if (c.done || c.running) return;
      if (!env.motion) { this.finish(c); return; }
      var self = this, t0 = null, dur = 1200;
      c.running = true;
      function step(now) {
        if (!env.motion) { c.running = false; self.finish(c); return; }
        if (t0 === null) t0 = now;
        var t = clamp((now - t0) / dur);
        self.show(c, Math.round(c.to * easeOut(t)));
        if (t < 1) window.requestAnimationFrame(step);
        else { c.running = false; c.done = true; }
      }
      window.requestAnimationFrame(step);
    },
    finish: function (c) { c.done = true; this.show(c, c.to); },
    enable: function () {
      // motion on: not-yet-counted numbers start from 0 (they count when their tile enters the screen).
      // Without IntersectionObserver nothing would ever start them, so the final numbers simply stay.
      for (var i = 0; i < this.counters.length; i++) {
        var c = this.counters[i];
        if (!this.io) this.finish(c);
        else if (!c.done && !c.running) this.show(c, 0);
      }
    },
    disable: function () {
      for (var i = 0; i < this.counters.length; i++) this.finish(this.counters[i]);
    }
  });

  /* ===========================================================================
     13. SCENE: SKILLS  (text swaps are CSS maths; JS drives the phone, screens, rail state)
     =========================================================================== */
  Scenes.add('skills', {
    init: function (el, ctx) {
      var self = this;
      this.steps = all('.skill', el);
      this.screens = all('.screen', el);
      this.dots = all('.rail__dot', el);
      this.pose = el.querySelector('[data-pose]') || el.querySelector('.phone');   // 3D pose target
      this.N = this.steps.length || 1;
      this.active = -1;
      this.lastV = [];
      this.lastS = [];
      this.phoneT = '';
      el.style.setProperty('--n', String(this.N));

      this.dots.forEach(function (dot, i) {
        dot.addEventListener('click', function () { self.goTo(i, ctx); });
        // Tabbing into the rail while the pinned stage is off screen brings the stage (at that step) on screen
        dot.addEventListener('focus', function () {
          var sc = ctx.scene('skills'), y = window.pageYOffset;
          if (sc && env.motion && (y < sc.top - 4 || y > sc.top + sc.range + 4)) self.goTo(i, ctx);
        });
        // arrow keys / Home / End move between steps (focus + scroll)
        dot.addEventListener('keydown', function (e) {
          var k = e.key, to = -1;
          if (k === 'ArrowDown' || k === 'ArrowRight') to = Math.min(self.dots.length - 1, i + 1);
          else if (k === 'ArrowUp' || k === 'ArrowLeft') to = Math.max(0, i - 1);
          else if (k === 'Home') to = 0;
          else if (k === 'End') to = self.dots.length - 1;
          if (to >= 0) {
            e.preventDefault();
            self.dots[to].focus({ preventScroll: true });
            self.goTo(to, ctx);
          }
        });
      });
    },
    goTo: function (i, ctx) {
      var y = ctx.yFor('skills', (i + REST) / this.N);
      window.scrollTo({ top: y, behavior: 'smooth' });
    },
    update: function (el, p) {
      var N = this.N, q = p * N, i, scr, v, s, up, down, str;
      var W = 0.06;                                   // half-width of the cross-fade, in steps (kit contract)
      var act = clamp(Math.floor(q), 0, N - 1);

      for (i = 0; i < N; i++) {
        scr = this.screens[i];
        if (!scr) continue;
        v = clamp((q - i) / 0.6);                     // own animation progress: 1 once its step has passed
        // symmetric dissolve: incoming s rises across (i - W .. i + W), outgoing falls across (i + 1 - W .. i + 1 + W)
        up = i === 0 ? 1 : smoothstep(i - W, i + W, q);
        down = i === N - 1 ? 1 : 1 - smoothstep(i + 1 - W, i + 1 + W, q);
        s = Math.min(up, down);
        str = fmt(v, 3);
        if (this.lastV[i] !== str) { this.lastV[i] = str; scr.style.setProperty('--v', str); }
        str = fmt(s, 3);
        if (this.lastS[i] !== str) { this.lastS[i] = str; scr.style.setProperty('--s', str); }
      }

      if (act !== this.active) {
        this.active = act;
        for (i = 0; i < N; i++) {
          if (this.steps[i]) this.steps[i].classList.toggle('is-active', i === act);
          if (this.screens[i]) this.screens[i].classList.toggle('is-active', i === act);
          var d = this.dots[i];
          if (d) {
            d.classList.toggle('is-active', i === act);
            d.classList.toggle('is-past', i < act);
            if (i === act) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
          }
        }
      }

      // phone: eases in from a 3D tilt (first 6%), keeps a subtle p-linked float, eases out (last 6%)
      if (this.pose) {
        var enter = easeOut(seg(p, 0, 0.06));
        var exit = easeInOut(seg(p, 0.94, 1));
        var live = enter * (1 - exit);
        var ry = lerp(-18, 0, enter) + 16 * exit + Math.sin(p * 9.4) * 1.7 * live;
        var rx = lerp(6, 0, enter) - 5 * exit + Math.sin(p * 7 + 1) * 0.9 * live;
        var ty = Math.sin(p * 12.5) * 6 * live;
        var sc = lerp(0.9, 1, enter) - 0.07 * exit;
        var t = 'perspective(1600px) rotateY(' + fmt(ry, 2) + 'deg) rotateX(' + fmt(rx, 2) + 'deg) translate3d(0,' + fmt(ty, 1) + 'px,0) scale(' + fmt(sc, 4) + ')';
        if (t !== this.phoneT) { this.phoneT = t; this.pose.style.transform = t; }
      }
    },
    disable: function () {
      var i;
      this.lastV = [];
      this.lastS = [];
      this.active = -1;
      this.phoneT = '';
      if (this.pose) this.pose.style.transform = '';
      for (i = 0; i < this.screens.length; i++) {
        this.screens[i].style.removeProperty('--v');
        this.screens[i].style.removeProperty('--s');
        this.screens[i].classList.remove('is-active');
      }
      for (i = 0; i < this.steps.length; i++) this.steps[i].classList.remove('is-active');
      for (i = 0; i < this.dots.length; i++) {
        this.dots[i].classList.remove('is-active', 'is-past');
        this.dots[i].removeAttribute('aria-current');
      }
    }
  });

  /* ===========================================================================
     14. SCENE: EXPERIENCE  (the spine is drawn by --spine, nodes fill with --n, a role is revealed once reached)
     =========================================================================== */
  var READ = 0.7;                    // the spine tip sits at 70% of the viewport height
  var NODE_LEAD = 18;                // a node starts to fill this many px before the tip reaches its centre
  var NODE_FILL = 46;                // ... and is full this many px later

  Scenes.add('experience', {
    init: function (el) {
      this.tl = el.querySelector('[data-timeline]');
      this.roles = all('[data-role]', el);
      this.nodeY = [];               // node centres, relative to the top of the scene
      this.sTop = 0;                 // spine start (first node centre) and length, relative to the top of the scene
      this.sLen = 1;
      this.tlTop = 0;
      this.styleDirty = true;
      this.lastSpine = '';
      this.lastN = [];
      this.reached = [];
    },
    measure: function (el, ctx, sc) {
      if (!ctx.env.motion || !this.tl || !this.roles.length) return;
      var sy = window.pageYOffset, i, r;
      this.tlTop = this.tl.getBoundingClientRect().top + sy - sc.top;
      this.nodeY = [];
      for (i = 0; i < this.roles.length; i++) {
        r = this.roles[i].querySelector('.role__node').getBoundingClientRect();
        this.nodeY.push(r.top + sy - sc.top + r.height / 2);
      }
      r = this.roles[this.roles.length - 1].getBoundingClientRect();
      this.sTop = this.nodeY[0];
      this.sLen = Math.max(1, r.bottom + sy - sc.top - this.sTop);
      this.styleDirty = true;
    },
    update: function (el, p, ctx, sc) {
      if (!this.tl) return;
      if (this.styleDirty) {
        this.styleDirty = false;
        this.tl.style.setProperty('--spine-top', fmt(this.sTop - this.tlTop, 1) + 'px');
        this.tl.style.setProperty('--spine-h', fmt(this.sLen, 1) + 'px');
      }
      // the tip of the spine, relative to the scene: a pure function of p (p = (scrollY + vh - top) / (h + vh))
      var tip = p * (sc.h + ctx.env.vh) - ctx.env.vh * (1 - READ);
      var s = fmt(clamp((tip - this.sTop) / this.sLen), 4);
      if (s !== this.lastSpine) { this.lastSpine = s; this.tl.style.setProperty('--spine', s); }
      for (var i = 0; i < this.roles.length; i++) {
        var n = fmt(clamp((tip - this.nodeY[i] + NODE_LEAD) / NODE_FILL), 2);
        if (n !== this.lastN[i]) { this.lastN[i] = n; this.roles[i].style.setProperty('--n', n); }
        if (!this.reached[i] && +n > 0) { this.reached[i] = true; this.roles[i].classList.add('is-reached'); }
      }
    },
    disable: function () {
      this.reached = [];
      this.lastN = [];
      this.lastSpine = '';
      this.styleDirty = true;
      this.roles.forEach(function (r) { r.classList.remove('is-reached'); r.style.removeProperty('--n'); });
      if (this.tl) ['--spine', '--spine-top', '--spine-h'].forEach(function (k) { this.tl.style.removeProperty(k); }, this);
    }
  });

  /* ===========================================================================
     15. SCENE: PROJECTS  (a native scroll-snap shelf; script.js adds drag, keys, buttons, dots and feeds --d)
     =========================================================================== */
  Scenes.add('projects', {
    init: function (el, ctx) {
      var self = this;
      var shelf = this.shelf = el.querySelector('[data-shelf]');
      this.cards = all('.proj', el);
      this.dots = all('.shelf__dot', el);
      this.prev = el.querySelector('[data-prev]');
      this.next = el.querySelector('[data-next]');
      this.centers = [];             // card centres in the shelf's scroll space
      this.cw = 0;                   // shelf client width
      this.maxX = 0;
      this.pitch = 1;                // distance between two card centres
      this.x = 0;                    // scrollLeft, read in the scroll listener (never inside the frame)
      this.cur = -1;
      this.lastD = [];
      this.moved = false;
      this.drag = null;
      this.timer = 0;
      if (!shelf || !this.cards.length) return;

      shelf.addEventListener('scroll', function () {
        self.x = shelf.scrollLeft;
        pointerStale = true;
        ctx.dirty('projects');
      }, { passive: true });

      // arrow keys / Home / End move one card at a time
      shelf.addEventListener('keydown', function (e) {
        var last = self.cards.length - 1, k = e.key, to = -1;
        if (k === 'ArrowRight') to = Math.min(last, Math.max(0, self.cur) + 1);
        else if (k === 'ArrowLeft') to = Math.max(0, self.cur - 1);
        else if (k === 'Home') to = 0;
        else if (k === 'End') to = last;
        if (to < 0) return;
        e.preventDefault();
        self.goTo(to);
      });
      if (this.prev) this.prev.addEventListener('click', function () { self.goTo(self.cur - 1); });
      if (this.next) this.next.addEventListener('click', function () { self.goTo(self.cur + 1); });
      this.dots.forEach(function (d, i) { d.addEventListener('click', function () { self.goTo(i); }); });

      // mouse drag (touch and pen scroll natively); a fast flick moves one card further
      shelf.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !env.motion) return;
        self.drag = { id: e.pointerId, x0: e.clientX, left0: shelf.scrollLeft, on: false, lx: e.clientX, lt: e.timeStamp, v: 0, i0: self.cur };
      });
      shelf.addEventListener('pointermove', function (e) {
        var d = self.drag;
        if (!d || e.pointerId !== d.id) return;
        var dx = e.clientX - d.x0;
        if (!d.on) {
          if (Math.abs(dx) < 5) return;
          d.on = true;
          try { shelf.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
          window.clearTimeout(self.timer);
          shelf.classList.add('is-dragging');
        }
        var dt = e.timeStamp - d.lt;
        if (dt > 0) d.v = 0.75 * d.v + 0.25 * ((e.clientX - d.lx) / dt);       // px per ms, smoothed
        d.lx = e.clientX;
        d.lt = e.timeStamp;
        shelf.scrollLeft = d.left0 - dx;
      });
      function endDrag(e) {
        var d = self.drag;
        if (!d || (e && e.pointerId !== d.id)) return;
        self.drag = null;
        if (!d.on) return;
        var i = self.nearest(self.x + self.cw / 2);
        if (Math.abs(d.v) > 0.45) i = d.v < 0 ? Math.max(i, d.i0 + 1) : Math.min(i, d.i0 - 1);
        self.goTo(i);
        self.timer = window.setTimeout(function () { shelf.classList.remove('is-dragging'); }, 700);
      }
      shelf.addEventListener('pointerup', endDrag);
      shelf.addEventListener('pointercancel', endDrag);
    },
    nearest: function (xc) {
      var best = 0, bd = Infinity, i, d;
      for (i = 0; i < this.centers.length; i++) {
        d = Math.abs(this.centers[i] - xc);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    goTo: function (i) {
      i = clamp(i, 0, this.cards.length - 1);
      this.shelf.scrollTo({ left: Math.max(0, Math.min(this.maxX, this.centers[i] - this.cw / 2)), behavior: 'smooth' });
    },
    measure: function (el, ctx) {
      var s = this.shelf;
      if (!s || !ctx.env.motion) return;
      this.cw = s.clientWidth;
      this.maxX = Math.max(0, s.scrollWidth - this.cw);
      this.centers = this.cards.map(function (c) { return c.offsetLeft + c.offsetWidth / 2; });
      this.pitch = this.centers.length > 1 ? this.centers[1] - this.centers[0] : (this.cw || 1);
      this.x = s.scrollLeft;
    },
    update: function (el) {
      var n = this.cards.length, xc = this.x + this.cw / 2, best = 0, bd = Infinity, i, d, str;
      for (i = 0; i < n; i++) {
        d = (this.centers[i] - xc) / this.pitch;
        str = fmt(d, 3);
        if (str !== this.lastD[i]) { this.lastD[i] = str; this.cards[i].style.setProperty('--d', str); }
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; }
      }
      if (best !== this.cur) {
        this.cur = best;
        for (i = 0; i < n; i++) {
          this.cards[i].classList.toggle('is-current', i === best);
          if (!this.dots[i]) continue;
          this.dots[i].classList.toggle('is-current', i === best);
          if (i === best) this.dots[i].setAttribute('aria-current', 'true');
          else this.dots[i].removeAttribute('aria-current');
        }
      }
      this.setDisabled(this.prev, this.x <= 2, this.next);
      this.setDisabled(this.next, this.x >= this.maxX - 2, this.prev);
      if (!this.moved && this.x > 8) { this.moved = true; el.classList.add('has-moved'); }
    },
    // a button that becomes disabled while it has the focus hands the focus to its partner (or the shelf)
    setDisabled: function (btn, off, other) {
      if (!btn || btn.disabled === off) return;
      btn.disabled = off;
      if (off && document.activeElement === btn) (other && !other.disabled ? other : this.shelf).focus({ preventScroll: true });
    },
    enable: function () {
      if (this.shelf) this.shelf.tabIndex = 0;       // the shelf scrolls only in the motion layout, so only then it is a tab stop
    },
    disable: function (el) {
      window.clearTimeout(this.timer);
      this.drag = null;
      this.cur = -1;
      this.lastD = [];
      this.moved = false;
      el.classList.remove('has-moved');
      if (this.shelf) {
        this.shelf.removeAttribute('tabindex');
        this.shelf.classList.remove('is-dragging');
        this.shelf.scrollLeft = 0;
      }
      this.cards.forEach(function (c) { c.classList.remove('is-current'); c.style.removeProperty('--d'); });
      this.dots.forEach(function (d) { d.classList.remove('is-current'); d.removeAttribute('aria-current'); });
      [this.prev, this.next].forEach(function (b) { if (b) b.disabled = false; });
    }
  });

  /* ===========================================================================
     16. SCENE: MARQUEE  (the rows are moved by --p in CSS; here the pills are repeated so a row never runs out)
     =========================================================================== */
  Scenes.add('marquee', {
    init: function (el) {
      all('.marquee__track', el).forEach(function (track) {
        var set = Array.prototype.slice.call(track.children);
        for (var rep = 0; rep < 2; rep++) {
          set.forEach(function (pill) { track.appendChild(pill.cloneNode(true)); });
        }
      });
    }
  });

  /* ===========================================================================
     17. SCENE: CONTACT  (headline words brighten with --p in CSS; JS splits them and guards keyboard focus)
     =========================================================================== */
  Scenes.add('contact', {
    init: function (el, ctx) {
      var title = el.querySelector('[data-words]');
      if (title) splitWords(title, 0, 0.4, 0.14);
      this.armed = false;
      // Tabbing into the links while the copy is still invisible brings the finished composition on screen.
      el.addEventListener('focusin', function () {
        var sc = ctx.scene('contact');
        if (env.motion && sc && sc.pinned && sc.p < 0.78) window.scrollTo({ top: ctx.yFor('contact', 0.86), behavior: 'instant' });
      });
    },
    update: function (el, p) {
      var armed = p >= 0.3;
      if (armed !== this.armed) { this.armed = armed; el.classList.toggle('is-armed', armed); }
    },
    disable: function (el) {
      this.armed = false;
      el.classList.remove('is-armed');
    }
  });

  /* ===========================================================================
     18. BOOT
     =========================================================================== */
  var lastW = 0, lastH = 0;

  function applyMotion(initial) {
    var on = motionAllowed();
    var changed = on !== env.motion;
    env.motion = on;
    root.classList.toggle('motion-ok', on);
    env.fine = on && mqFine.matches;
    if (!changed && !initial) return;

    var i, sc;
    if (on) {
      for (i = 0; i < scenes.length; i++) {
        sc = scenes[i];
        sc.mode = -1; sc.p = -1; sc.state = '';
        if (sc.def && sc.def.enable) sc.def.enable(sc.el, ctx);
      }
    } else {
      for (i = 0; i < scenes.length; i++) {
        sc = scenes[i];
        sc.el.style.removeProperty('--p');
        sc.el.removeAttribute('data-state');
        sc.el.classList.remove('is-near');
        sc.mode = -1; sc.p = -1; sc.state = '';
        if (sc.def && sc.def.disable) sc.def.disable(sc.el, ctx);
      }
    }
    needMeasure = true;
    forceAll = true;
    requestTick();
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    var big = w !== lastW || Math.abs(h - lastH) > 150;
    lastW = w; lastH = h;
    env.vh = h;
    var wasMotion = env.motion;
    if (w > 860 && header.classList.contains('nav-open')) setMenu(false);
    applyMotion(false);
    if (big || wasMotion !== env.motion) { needMeasure = true; forceAll = true; }
    else forceAll = true;
    requestTick();
  }

  function boot() {
    // scenes
    all('section.scene[data-scene]').forEach(function (el) {
      var name = el.getAttribute('data-scene');
      var sc = {
        el: el, name: name,
        isPinned: el.classList.contains('scene--pinned'),
        stage: el.querySelector(':scope > .scene__stage'),
        def: Scenes.defs[name] || null,
        pinned: false, top: 0, h: 0, range: 1, stageH: 0,
        p: -1, mode: -1, state: ''
      };
      if (sc.isPinned && !sc.stage) sc.isPinned = false;
      scenes.push(sc);
      byName[name] = sc;
    });

    // tone / scrollspy zones
    var targets = navLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    all('main > section, .site-footer').forEach(function (el) {
      var sc = null, i;
      var spy = el.getAttribute('data-spy');            // a band that has no nav link of its own keeps another section's link lit
      for (i = 0; i < scenes.length; i++) if (scenes[i].el === el) sc = scenes[i];
      zones.push({ el: el, sc: sc, dark: el.classList.contains('scene--dark') || el.classList.contains('tone-dark'), link: targets.indexOf(spy ? document.getElementById(spy) : el), top: 0, h: 0 });
    });

    initTheme();
    initMenu();
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();

    lastW = window.innerWidth; lastH = window.innerHeight;
    env.vw = root.clientWidth || lastW; env.vh = lastH;

    // scene init (always), then motion state (calls enable/disable)
    scenes.forEach(function (sc) { if (sc.def && sc.def.init) sc.def.init(sc.el, ctx); });
    booted = true;
    applyMotion(true);

    initReveal();
    initPointer();

    // first synchronous pass so the very first paint is already correct
    measure();
    forceAll = true;
    tick();

    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { window.setTimeout(onResize, 120); });
    window.addEventListener('load', function () { needMeasure = true; requestTick(); window.setTimeout(reanchor, 60); });
    onMQ(mqReduce, function () { applyMotion(false); });
    onMQ(mqFine, function () { applyMotion(false); });
    window.addEventListener('beforeprint', function () { env.printing = true; applyMotion(false); });
    window.addEventListener('afterprint', function () { env.printing = false; applyMotion(false); });

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { needMeasure = true; requestTick(); });
      var mainEl = document.getElementById('main');
      if (mainEl) ro.observe(mainEl);
      scenes.forEach(function (sc) { ro.observe(sc.el); });
    }

    // Deep links (index.html#skills): web fonts and the motion layout change the geometry after the browser has done its
    // anchor scroll, so nudge the page back onto the target once layout has settled - unless the visitor already scrolled.
    var userScrolled = false;
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (type) {
      window.addEventListener(type, function () { userScrolled = true; }, { passive: true, once: true });
    });
    function reanchor() {
      var h = window.location.hash;
      if (userScrolled || !h || h.length < 2) return;
      var target = document.getElementById(decodeURIComponent(h.slice(1)));
      if (!target) return;
      // where the browser parks the target's top edge for an anchor jump (0 for most sections, above the screen for #contact)
      var landing = (parseFloat(window.getComputedStyle(root).scrollPaddingTop) || 0) + (parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0);
      var drift = target.getBoundingClientRect().top - landing;
      if (Math.abs(drift) > 2 && Math.abs(drift) < 800) window.scrollBy({ top: drift, behavior: 'instant' });
    }

    // fonts change geometry: re-measure, then let the intro play
    var introDone = false;
    function intro() {
      if (introDone) return;
      introDone = true;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { root.classList.add('is-ready'); });
      });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { needMeasure = true; requestTick(); intro(); window.requestAnimationFrame(reanchor); });
      window.setTimeout(intro, 900);
    } else {
      intro();
    }
    // smooth anchor scrolling only after the page has settled (see styles.css, html.can-smooth)
    window.setTimeout(function () { root.classList.add('can-smooth'); }, 1500);
  }

  window.Engine = { ctx: ctx, Scenes: Scenes, env: env, measure: function () { needMeasure = true; requestTick(); }, tick: tick };

  // This script is the last element of <body>, so the whole page is already parsed: boot synchronously
  // (before first paint) so the very first frame is already correct.
  boot();
})();
