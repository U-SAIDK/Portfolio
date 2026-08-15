/**
 * Hero interactive field — a cursor-reactive physics field rendered on the
 * existing #particle-canvas (hero background layer). This replaces the
 * previous lightweight particles.js with a proper force-based simulation:
 * every particle has a home position, velocity, mass-like "reactivity" and
 * depth, and is pushed around by real forces (spring, cursor repulsion/
 * attraction, a velocity-aligned "sweep", and a coherent ambient flow)
 * rather than having its position assigned directly from the cursor.
 *
 * PROTECTED SYSTEMS — this file must never touch either of these:
 *   - The hero robot (#robot-widget / robot.js, Three.js). It already
 *     paints above this canvas (z-index) and is itself pointer-events:none,
 *     so the two coexist purely through normal compositing — nothing here
 *     reads robot.js state or vice versa.
 *   - The contact form / Turnstile pipeline. This module has no DOM
 *     reach outside #hero and never queries or listens on anything
 *     related to the form.
 *
 * Lifecycle: one IIFE, one init, one requestAnimationFrame loop, paused
 * via IntersectionObserver + visibilitychange (same pattern the rest of
 * this codebase already uses in particles.js/robot.js). No polling, no
 * per-frame benchmarking — quality is chosen once via cheap heuristics,
 * with one allowed one-directional runtime downgrade if sustained frame
 * time is poor.
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.getElementById('particle-canvas');
  var hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ============================================================
     CONFIG — every tunable value lives here. `base` applies to all
     tiers; `tiers` overrides a subset per quality level. Nothing below
     this block should contain a bare magic number for tuning purposes.
     ============================================================ */
  var CONFIG = {
    base: {
      heroIntensity: 1,          // single dial to scale the whole force system
      maxDPR: 1.75,              // devicePixelRatio cap
      particleRadius: [0.6, 2.4],   // [min, max], interpolated by depth
      particleAlpha: [0.10, 0.5],   // [min, max], interpolated by depth
      attractFraction: 0.15,     // share of particles that pull toward the cursor instead of away
      interactionRadius: 170,
      springStrength: 1.1,
      repulsionStrength: 2600,
      attractionStrength: 900,
      sweepStrength: 0.9,        // force along the cursor's own velocity direction
      velocityNormalizer: 900,   // px/s of cursor speed treated as "fast"
      velocityInfluenceMax: 1.8, // cap on the speed-based force multiplier
      noiseStrength: 55,
      noiseScale: 0.002,
      noiseSpeed: 0.35,
      friction: 2.4,             // exponential damping rate (1/s)
      maxSpeed: 620,             // px/s, safety clamp so a fast flick can't destabilize
      cursorSmoothing: 10,       // lambda: how quickly smoothed cursor catches raw cursor
      velocitySmoothing: 6,
      trailMaxAge: 480,          // ms
      trailMinSpeed: 90,         // px/s — below this, no trail is drawn
      rippleDuration: 900,       // ms
      rippleMaxRadius: 150,
      rippleImpulseRadius: 170,
      rippleImpulseStrength: 260,
      maxConcurrentRipples: 4,
      connectDistance: 92,
      connectAlpha: 0.14,
      densityDivisor: 9000,      // (canvas area) / divisor = particle count, before cap
      densityCap: 130,
      connections: true,
      trail: true,
      ripples: true,
    },
    tiers: {
      medium: { densityDivisor: 11000, densityCap: 75, interactionRadius: 150 },
      low: {
        densityDivisor: 16000, densityCap: 34, interactionRadius: 130,
        connections: false, trail: false, attractFraction: 0,
        noiseStrength: 40, repulsionStrength: 2100,
      },
    },
  };

  /* ============================================================
     QUALITY — resolved once via cheap heuristics (no per-frame
     benchmarking). Touch/coarse-pointer and small/weak devices get the
     lighter tiers; everything else gets the full experience.
     ============================================================ */
  function detectQuality() {
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var narrow = window.innerWidth < 860;
    if (coarse || narrow) return 'low';
    var cores = navigator.hardwareConcurrency || 4;
    if (cores <= 4 || window.innerWidth < 1280) return 'medium';
    return 'high';
  }

  var quality = detectQuality();
  var settings; // resolved CONFIG for the active tier

  function resolveSettings(tier) {
    var s = Object.assign({}, CONFIG.base);
    if (CONFIG.tiers[tier]) Object.assign(s, CONFIG.tiers[tier]);
    return s;
  }
  settings = resolveSettings(quality);

  /* ============================================================
     THEME COLORS — reads --field-a/b/c rather than --primary/--secondary/
     --accent directly. Those brand tokens are tuned for solid fills
     (buttons, text) where alpha-blending never comes into play; a
     particle field alpha-composites color onto the page background every
     frame, and the same alpha value reads far weaker blended onto a
     near-white surface than onto a near-black one (the result's
     luminance sits close to the light bg's luminance either way). The
     --field-* tokens are dedicated, deliberately darker/richer hues for
     light mode specifically (aliases of the brand colors in dark mode,
     where the contrast problem doesn't exist) — see tokens.css.
     --field-contrast is a companion alpha multiplier applied everywhere
     below that computes an alpha (particles, connections, trail,
     ripples), also 1 in dark mode and >1 in light mode.
     ============================================================ */
  function hexToRgb(hex, fallback) {
    var value = String(hex || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!m) return fallback;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    return {
      primary: hexToRgb(cs.getPropertyValue('--field-a'), [124, 108, 247]),
      secondary: hexToRgb(cs.getPropertyValue('--field-b'), [34, 211, 238]),
      accent: hexToRgb(cs.getPropertyValue('--field-c'), [251, 113, 133]),
    };
  }

  function readContrast() {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--field-contrast'));
    return isFinite(v) && v > 0 ? v : 1;
  }

  var colors = readColors();
  var fieldContrast = readContrast();
  document.documentElement.addEventListener('uk-themechange', function () {
    colors = readColors();
    fieldContrast = readContrast();
  });

  /* ============================================================
     CANVAS SIZING — DPR-aware (the previous implementation rendered at
     1 canvas-px per CSS-px regardless of screen density). setTransform
     (not scale) is used on every resize so repeated resizes never
     compound the scale factor.
     ============================================================ */
  var W = 0, H = 0, DPR = 1;

  function sizeCanvas() {
    W = window.innerWidth;
    H = hero.offsetHeight;
    DPR = Math.min(window.devicePixelRatio || 1, settings.maxDPR);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ============================================================
     CURSOR — Pointer Events unify mouse/touch/pen with one code path.
     Event handlers only ever store the raw viewport-space coordinate;
     conversion to hero-local space and all smoothing/velocity math
     happens once per animation frame in updateCursor(), not once per
     (possibly 100+/s on a high-poll-rate mouse) pointermove event. This
     also keeps the hero's bounding rect measured fresh every frame
     instead of cached-and-stale across a scroll.
     ============================================================ */
  var cursor = {
    clientX: 0, clientY: 0, // last raw viewport-space pointer position
    x: 0, y: 0,              // smoothed position, hero-local
    vx: 0, vy: 0,            // smoothed velocity, px/s
    speed: 0,
    inWindow: false,
  };

  window.addEventListener('pointermove', function (e) {
    cursor.clientX = e.clientX;
    cursor.clientY = e.clientY;
    cursor.inWindow = true;
  }, { passive: true });

  document.addEventListener('pointerleave', function () { cursor.inWindow = false; }, { passive: true });
  window.addEventListener('blur', function () { cursor.inWindow = false; });
  window.addEventListener('pointerup', function () {
    // Touch has no hover state — treat lift-off like the pointer leaving.
    if (window.matchMedia('(pointer: coarse)').matches) cursor.inWindow = false;
  }, { passive: true });
  window.addEventListener('pointercancel', function () { cursor.inWindow = false; }, { passive: true });

  // Ripple: a single tap/click within the hero. Listening on #hero (not
  // the canvas, which is pointer-events:none) means real UI elements in
  // the hero keep working exactly as before — this only ever reads
  // coordinates from the bubbled event, never calls preventDefault.
  hero.addEventListener('pointerdown', function (e) {
    if (!settings.ripples) return;
    var r = hero.getBoundingClientRect();
    spawnRipple(e.clientX - r.left, e.clientY - r.top);
  }, { passive: true });

  /* ============================================================
     FRAME-RATE-INDEPENDENT DAMPING — same exact technique already used
     in robot.js (Freya Holmér's "exact damping"), reused here so cursor
     smoothing and particle friction behave consistently regardless of
     refresh rate or frame-time hitches.
     ============================================================ */
  function damp(current, target, lambda, dt) {
    return target + (current - target) * Math.exp(-lambda * dt);
  }

  function updateCursor(dt) {
    if (dt <= 0) return;
    // Measured fresh every frame (not cached) so scrolling the page while
    // the hero is partially visible can never leave this stale.
    var r = hero.getBoundingClientRect();
    var rawX = cursor.clientX - r.left;
    var rawY = cursor.clientY - r.top;

    var prevX = cursor.x, prevY = cursor.y;
    cursor.x = damp(cursor.x, rawX, settings.cursorSmoothing, dt);
    cursor.y = damp(cursor.y, rawY, settings.cursorSmoothing, dt);

    var instVx = (cursor.x - prevX) / dt;
    var instVy = (cursor.y - prevY) / dt;
    cursor.vx = damp(cursor.vx, instVx, settings.velocitySmoothing, dt);
    cursor.vy = damp(cursor.vy, instVy, settings.velocitySmoothing, dt);
    cursor.speed = Math.hypot(cursor.vx, cursor.vy);
  }

  /* ============================================================
     AMBIENT FLOW — cheap coherent 2D noise (layered sines, not a true
     Perlin/Simplex implementation) so nearby particles drift together
     instead of jittering independently. Deliberately not a dependency —
     at this visual scale the difference from "real" noise is invisible.
     ============================================================ */
  function flowAngle(x, y, t) {
    var n = Math.sin(x * settings.noiseScale + t) +
      Math.sin(y * settings.noiseScale * 1.3 - t * 0.8) +
      Math.sin((x + y) * settings.noiseScale * 0.6 + t * 0.5);
    return (n / 3) * Math.PI; // ~[-PI, PI]
  }

  /* ============================================================
     PARTICLES — plain objects, created once in buildParticles() and
     mutated in place every frame (no per-frame allocation).
     ============================================================ */
  var particles = [];

  function lerp(a, b, t) { return a + (b - a) * t; }

  function makeParticle() {
    var depth = Math.random(); // 0 = background, 1 = foreground
    var hue = Math.random();
    return {
      x: Math.random() * W, y: Math.random() * H,
      homeX: 0, homeY: 0, // set below, kept in sync with x/y at creation
      vx: 0, vy: 0,
      depth: depth,
      radius: lerp(settings.particleRadius[0], settings.particleRadius[1], depth),
      // Base alpha only — fieldContrast is applied at draw time (not
      // baked in here) so a theme toggle recolors/recontrasts existing
      // particles immediately instead of only affecting ones created
      // after the switch.
      alphaBase: lerp(settings.particleAlpha[0], settings.particleAlpha[1], depth),
      reactivity: lerp(0.5, 1.2, depth),      // foreground reacts more to the cursor
      noiseFactor: lerp(1.3, 0.7, depth),     // background drifts more on its own
      group: Math.random() < settings.attractFraction ? 'attract' : 'repel',
      color: (hue > 0.6 ? colors.primary : hue > 0.3 ? colors.secondary : colors.accent).join(','),
      noisePhase: Math.random() * 1000,
    };
  }

  function buildParticles() {
    var count = Math.min(Math.floor((W * H) / settings.densityDivisor), settings.densityCap);
    particles = new Array(Math.max(count, 0));
    for (var i = 0; i < particles.length; i++) {
      var p = makeParticle();
      p.homeX = p.x;
      p.homeY = p.y;
      particles[i] = p;
    }
  }

  var PAD = 40; // soft-bounds safety margin so a fast disturbance can't fling a particle permanently offscreen

  function stepParticle(p, dt, t) {
    var ax = 0, ay = 0;

    // 1. Home / spring force — always pulling gently back toward origin.
    ax += (p.homeX - p.x) * settings.springStrength;
    ay += (p.homeY - p.y) * settings.springStrength;

    // 2. Cursor forces — nonlinear falloff, amplified by cursor speed.
    if (cursor.inWindow) {
      var dx = p.x - cursor.x, dy = p.y - cursor.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      var radius = settings.interactionRadius * p.reactivity;
      if (dist < radius) {
        var linear = 1 - dist / radius;
        var falloff = linear * linear; // quadratic — strongest right at the cursor
        var speedBoost = 1 + Math.min(cursor.speed / settings.velocityNormalizer, settings.velocityInfluenceMax);
        var nx = dx / dist, ny = dy / dist;

        if (p.group === 'attract') {
          ax -= nx * settings.attractionStrength * falloff * speedBoost * settings.heroIntensity;
          ay -= ny * settings.attractionStrength * falloff * speedBoost * settings.heroIntensity;
        } else {
          ax += nx * settings.repulsionStrength * falloff * speedBoost * settings.heroIntensity;
          ay += ny * settings.repulsionStrength * falloff * speedBoost * settings.heroIntensity;
        }

        // 3. Velocity "sweep" — fast cursor motion drags nearby particles
        // along its direction of travel, not just radially away from it.
        ax += cursor.vx * settings.sweepStrength * falloff;
        ay += cursor.vy * settings.sweepStrength * falloff;
      }
    }

    // 4. Ambient flow — organic idle motion, always active.
    var angle = flowAngle(p.x, p.y, t * settings.noiseSpeed + p.noisePhase);
    ax += Math.cos(angle) * settings.noiseStrength * p.noiseFactor;
    ay += Math.sin(angle) * settings.noiseStrength * p.noiseFactor;

    // Integrate velocity, then apply frame-rate-independent friction.
    p.vx += ax * dt;
    p.vy += ay * dt;
    var frictionScale = Math.exp(-settings.friction * dt);
    p.vx *= frictionScale;
    p.vy *= frictionScale;

    // Safety clamp — keeps a burst of force (e.g. a very fast flick) from
    // ever producing an unstable/runaway velocity.
    var speed = Math.hypot(p.vx, p.vy);
    if (speed > settings.maxSpeed) {
      var k = settings.maxSpeed / speed;
      p.vx *= k; p.vy *= k;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Soft bounds — a particle should never disappear permanently even
    // if briefly pushed past the canvas edge.
    if (p.x < -PAD) { p.x = -PAD; p.vx = Math.abs(p.vx) * 0.4; }
    else if (p.x > W + PAD) { p.x = W + PAD; p.vx = -Math.abs(p.vx) * 0.4; }
    if (p.y < -PAD) { p.y = -PAD; p.vy = Math.abs(p.vy) * 0.4; }
    else if (p.y > H + PAD) { p.y = H + PAD; p.vy = -Math.abs(p.vy) * 0.4; }
  }

  /* ============================================================
     TRAIL — a restrained, short-lived fading trail. Only appears while
     the cursor is actually moving with some speed, so it's invisible at
     rest (deliberately not a "gaming" glow trail).
     ============================================================ */
  var trail = [];

  function updateTrail(now) {
    if (settings.trail && cursor.inWindow && cursor.speed > settings.trailMinSpeed) {
      trail.push({ x: cursor.x, y: cursor.y, t: now });
    }
    while (trail.length && now - trail[0].t > settings.trailMaxAge) trail.shift();
  }

  function drawTrail(now) {
    for (var i = 0; i < trail.length; i++) {
      var pt = trail[i];
      var age = (now - pt.t) / settings.trailMaxAge;
      var a = Math.min(0.9, (1 - age) * 0.35 * fieldContrast);
      if (a <= 0) continue;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, lerp(3.2, 0.4, age), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + colors.secondary.join(',') + ',' + a + ')';
      ctx.fill();
    }
  }

  /* ============================================================
     RIPPLES — click/tap feedback: an expanding, fading ring plus a
     one-time outward velocity kick to nearby particles (not a continuous
     force, so it can never accumulate into instability).
     ============================================================ */
  var ripples = [];

  function spawnRipple(x, y) {
    if (ripples.length >= settings.maxConcurrentRipples) ripples.shift();
    ripples.push({ x: x, y: y, born: performance.now() });

    var r = settings.rippleImpulseRadius;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var dx = p.x - x, dy = p.y - y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      if (dist < r) {
        var f = (1 - dist / r) * settings.rippleImpulseStrength;
        p.vx += (dx / dist) * f;
        p.vy += (dy / dist) * f;
      }
    }
  }

  function drawRipples(now) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      var age = now - rp.born;
      if (age > settings.rippleDuration) { ripples.splice(i, 1); continue; }
      var t = age / settings.rippleDuration;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, t * settings.rippleMaxRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + colors.primary.join(',') + ',' + (Math.min(0.9, (1 - t) * 0.35 * fieldContrast)) + ')';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function drawParticle(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + p.color + ',' + Math.min(0.95, p.alphaBase * fieldContrast) + ')';
    ctx.fill();
  }

  var frameCount = 0;
  var D2_CONNECT;

  function drawConnections() {
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var a = particles[i], b = particles[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < D2_CONNECT) {
          var d = Math.sqrt(d2);
          var depthAvg = (a.depth + b.depth) / 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = 'rgba(' + colors.primary.join(',') + ',' +
            (Math.min(0.85, (1 - d / settings.connectDistance) * settings.connectAlpha * depthAvg * fieldContrast)) + ')';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  }

  /* ============================================================
     ADAPTIVE QUALITY — a cheap rolling average of frame time, checked
     only a few times per session (not every frame's worth of logic).
     Only ever downgrades, once, with a cooldown — never fights itself.
     ============================================================ */
  var frameTimes = [];
  var lastDowngradeCheck = 0;

  function maybeDowngrade(now, dt) {
    if (quality === 'low') return;
    frameTimes.push(dt);
    if (frameTimes.length < 90) return;
    var sum = 0;
    for (var i = 0; i < frameTimes.length; i++) sum += frameTimes[i];
    var avgMs = (sum / frameTimes.length) * 1000;
    frameTimes.length = 0;
    if (now - lastDowngradeCheck < 4000) return;
    lastDowngradeCheck = now;
    if (avgMs > 26) { // sustained sub-~38fps
      quality = quality === 'high' ? 'medium' : 'low';
      settings = resolveSettings(quality);
      D2_CONNECT = settings.connectDistance * settings.connectDistance;
      buildParticles();
    }
  }

  /* ============================================================
     LIFECYCLE
     ============================================================ */
  var active = true;
  var lastT = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!active) { lastT = now; return; }

    var dt = Math.min(Math.max((now - lastT) / 1000, 0), 0.05); // clamp: no huge catch-up jump after a tab-switch
    lastT = now;
    var t = now / 1000;

    updateCursor(dt);
    updateTrail(now);

    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < particles.length; i++) stepParticle(particles[i], dt, t);
    if (settings.connections && (++frameCount % 2 === 0)) drawConnections();
    for (var j = 0; j < particles.length; j++) drawParticle(particles[j]);
    if (settings.trail) drawTrail(now);
    if (settings.ripples) drawRipples(now);

    maybeDowngrade(now, dt);
  }

  function applySettings() {
    D2_CONNECT = settings.connectDistance * settings.connectDistance;
    sizeCanvas();
    buildParticles();
  }

  applySettings();
  requestAnimationFrame(frame);

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applySettings, 200);
  }, { passive: true });

  var heroObserver = new IntersectionObserver(function (entries) { active = entries[0].isIntersecting; }, { threshold: 0 });
  heroObserver.observe(hero);
  document.addEventListener('visibilitychange', function () { active = !document.hidden; });
})();
