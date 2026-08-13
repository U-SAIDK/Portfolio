/**
 * Site-wide UI behaviour: loading screen (with progress counter),
 * custom cursor, hero typing effect, 3D tilt + glare, nav scroll
 * state, scroll-progress bar, mobile menu, smooth scrolling and the
 * Konami-code easter egg. Scroll-reveal lives in reveal.js, the
 * theme toggle in theme.js, and the hero particles in particles.js.
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE_POINTER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── LOADING SCREEN (skipped entirely for reduced-motion users) ── */
  var loader = document.getElementById('loader');
  if (loader) {
    if (REDUCED) {
      loader.remove();
    } else {
      var bar = loader.querySelector('.loader-bar');
      var pct = loader.querySelector('.loader-pct');
      // Named loadPct (not `progress`) — this whole file is one IIFE and
      // `var` is function-scoped, not block-scoped, so a same-named
      // `progress` declared later (the #progress scroll-bar element, in
      // the nav scroll handler below) would hoist into this same scope
      // and collide with it. That collision is exactly what caused
      // "Cannot set properties of undefined (setting 'width')": whichever
      // rAF tick ran last — this loader tick (a number) or the scroll
      // handler (a DOM element) — silently overwrote the other's value in
      // the single shared variable.
      var loadPct = 0;
      var LOADER_DURATION = 1000; // ms

      var start = performance.now();
      (function tick(now) {
        var elapsed = now - start;
        loadPct = Math.min(100, (elapsed / LOADER_DURATION) * 100);
        if (bar) bar.style.width = loadPct + '%';
        if (pct) pct.textContent = Math.round(loadPct) + '%';

        if (elapsed < LOADER_DURATION) {
          requestAnimationFrame(tick);
        } else {
          setTimeout(function () {
            loader.classList.add('out');
            loader.addEventListener('transitionend', function () { loader.remove(); }, { once: true });
          }, 180);
        }
      })(start);
    }
  }

  /* ── CUSTOM CURSOR (fine pointers only) ── */
  var co = document.getElementById('co');
  var ci = document.getElementById('ci');
  if (FINE_POINTER && co && ci) {
    document.documentElement.classList.add('has-cursor');

    var mx = -200, my = -200, ox = -200, oy = -200;

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      ci.style.transform = 'translate(' + (mx - 2.5) + 'px,' + (my - 2.5) + 'px)';
    }, { passive: true });

    (function moveCursor() {
      ox += (mx - ox) * 0.11;
      oy += (my - oy) * 0.11;
      co.style.transform = 'translate(' + (ox - 18) + 'px,' + (oy - 18) + 'px)';
      requestAnimationFrame(moveCursor);
    })();

    document.querySelectorAll('a, button, input, textarea, select, .badge, .stat-card, .cert-card, .exp-card, .c-link').forEach(function (el) {
      el.addEventListener('mouseenter', function () { document.body.classList.add('cur-hover'); }, { passive: true });
      el.addEventListener('mouseleave', function () { document.body.classList.remove('cur-hover'); }, { passive: true });
    });
  }

  /* ── TYPING EFFECT ── */
  var roles = ['Software Engineer', 'DevOps Engineer', 'Cloud Engineer', 'Full-Stack Developer'];
  var typedEl = document.getElementById('typed');
  if (typedEl && !REDUCED) {
    var roleIndex = 0, charIndex = 0, deleting = false;

    function type() {
      var current = roles[roleIndex];
      if (deleting) {
        typedEl.textContent = current.slice(0, --charIndex);
        if (charIndex === 0) {
          deleting = false;
          roleIndex = (roleIndex + 1) % roles.length;
          setTimeout(type, 380);
          return;
        }
        setTimeout(type, 55);
        return;
      }
      typedEl.textContent = current.slice(0, ++charIndex);
      if (charIndex === current.length) {
        setTimeout(function () { deleting = true; type(); }, 2300);
        return;
      }
      setTimeout(type, 78);
    }
    setTimeout(type, 1600);
  }

  /* ── 3D TILT + CURSOR GLARE ── */
  document.querySelectorAll('[data-tilt]').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transition = 'transform 0.08s linear';
      card.style.transform = 'perspective(900px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateZ(4px)';
      card.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });

    card.addEventListener('mouseleave', function () {
      card.style.transition = 'transform 0.55s cubic-bezier(0.23, 1, 0.32, 1)';
      card.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateZ(0)';
    });
  });

  /* ── NAV SCROLL STATE + ACTIVE LINK + SCROLL PROGRESS + HIDE-ON-SCROLL ──
     Hide-on-scroll-down / show-on-scroll-up shares the same rAF-throttled
     scroll handler below rather than adding a second listener. `navRefY`
     only advances when we actually cross the dead-zone (DIR_DELTA) or hit
     the top threshold — comparing every frame's tiny delta instead would
     mean a slow, continuous scroll never accumulates enough per-frame
     movement to trigger a hide. */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  var sections = document.querySelectorAll('section[id]');
  var scrollTick = false;
  var navRefY = window.scrollY;
  var navHidden = false;
  var TOP_THRESHOLD = 80;  // always visible above this — "very top" per spec
  var DIR_DELTA = 10;      // dead-zone so small jitter can't flip state

  function setNavHidden(hidden) {
    if (navHidden === hidden) return;
    navHidden = hidden;
    nav.classList.toggle('nav-hidden', hidden);
  }

  window.addEventListener('scroll', function () {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      nav.classList.toggle('scrolled', y > 60);

      if (progress) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
      }

      // Never hide while the mobile menu is open — the close button lives
      // inside #nav.
      if (document.body.classList.contains('menu-open')) {
        setNavHidden(false);
        navRefY = y;
      } else if (y <= TOP_THRESHOLD) {
        setNavHidden(false);
        navRefY = y;
      } else {
        var delta = y - navRefY;
        if (delta > DIR_DELTA) {
          setNavHidden(true);
          navRefY = y;
        } else if (delta < -DIR_DELTA) {
          setNavHidden(false);
          navRefY = y;
        }
      }

      var current = '';
      sections.forEach(function (s) { if (y >= s.offsetTop - 140) current = s.id; });
      navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });

      scrollTick = false;
    });
  }, { passive: true });

  // Keyboard users tabbing into the nav (e.g. from a skip link) should
  // always be able to see what they've focused, even mid-scroll.
  nav.addEventListener('focusin', function () { setNavHidden(false); });

  /* ── MOBILE MENU ── */
  var burger = document.getElementById('burger');
  var mobMenu = document.getElementById('mob-menu');
  var mobClose = document.getElementById('mob-close');

  function closeMenu() {
    burger.classList.remove('open');
    mobMenu.classList.remove('open');
    mobMenu.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('menu-open');
  }

  if (burger && mobMenu) {
    burger.addEventListener('click', function () {
      var isOpen = mobMenu.classList.contains('open');
      if (isOpen) {
        closeMenu();
      } else {
        burger.classList.add('open');
        mobMenu.classList.add('open');
        mobMenu.setAttribute('aria-hidden', 'false');
        burger.setAttribute('aria-expanded', 'true');
        burger.setAttribute('aria-label', 'Close menu');
        document.body.classList.add('menu-open');
      }
    });

    if (mobClose) mobClose.addEventListener('click', closeMenu);

    mobMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobMenu.classList.contains('open')) closeMenu();
    });
  }

  /* ── SMOOTH SCROLL ── */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (REDUCED) {
        target.scrollIntoView({ block: 'start' });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ── KONAMI CODE ── */
  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var konamiIndex = 0;
  document.addEventListener('keydown', function (e) {
    konamiIndex = e.key === KONAMI[konamiIndex] ? konamiIndex + 1 : 0;
    if (konamiIndex === KONAMI.length) { konamiIndex = 0; launchKonami(); }
  });

  function launchKonami() {
    var overlay = document.getElementById('konami-overlay');
    var canvas = document.getElementById('konami-canvas');
    if (!overlay || !canvas) return;
    var kx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    overlay.classList.add('on');

    var colors = ['#7c6cf7', '#22d3ee', '#fb7185', '#fbbf24', '#f97316', '#34d399'];
    var particles = Array.from({ length: 320 }, function () {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 22,
        vy: (Math.random() - 0.5) * 22 - 9,
        r: Math.random() * 7 + 2,
        c: colors[Math.floor(Math.random() * colors.length)],
        a: 1,
        g: 0.3 + Math.random() * 0.25,
      };
    });

    (function animate() {
      kx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.a -= 0.014;
        if (p.a > 0) {
          kx.globalAlpha = p.a;
          kx.beginPath();
          kx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          kx.shadowBlur = 14; kx.shadowColor = p.c;
          kx.fillStyle = p.c;
          kx.fill();
          kx.shadowBlur = 0;
        }
      });
      kx.globalAlpha = 1;
      particles = particles.filter(function (p) { return p.a > 0; });
      if (particles.length) requestAnimationFrame(animate);
      else overlay.classList.remove('on');
    })();

    var toast = Object.assign(document.createElement('div'), {
      innerHTML: '<div style="font-size:2.8rem;margin-bottom:10px">🎮</div>' +
        '<div style="font-size:1.4rem;font-weight:700;background:linear-gradient(135deg,#7c6cf7,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">+30 Lives Unlocked!</div>' +
        '<div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:7px">Easter egg found 🥚</div>',
    });
    Object.assign(toast.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: '9992', textAlign: 'center', pointerEvents: 'none',
      fontFamily: "'Space Grotesk',sans-serif", color: '#fff',
    });
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3200);
  }
})();
