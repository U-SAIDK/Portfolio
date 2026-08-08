/**
 * Site-wide UI behaviour: loading screen, custom cursor, hero typing
 * effect, scroll-reveal animations, card tilt, nav scroll state, mobile
 * menu, smooth in-page scrolling, and the Konami-code easter egg.
 */
(function () {
  'use strict';

  /* ── LOADING SCREEN ── */
  window.addEventListener('load', () => {
    setTimeout(() => {
      const loader = document.getElementById('loader');
      if (!loader) return;
      loader.classList.add('out');
      loader.addEventListener('transitionend', () => loader.remove(), { once: true });
    }, 1200);
  });

  /* ── CUSTOM CURSOR ── */
  const co = document.getElementById('co');
  const ci = document.getElementById('ci');
  if (co && ci) {
    let mx = -200, my = -200, ox = -200, oy = -200;

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      ci.style.transform = `translate(${mx - 2.5}px,${my - 2.5}px)`;
    }, { passive: true });

    (function moveCursor() {
      ox += (mx - ox) * 0.11;
      oy += (my - oy) * 0.11;
      co.style.transform = `translate(${ox - 18}px,${oy - 18}px)`;
      requestAnimationFrame(moveCursor);
    })();

    document.querySelectorAll('a,button,input,textarea,.badge,.stat-card,.cert-card,.exp-card,.c-link').forEach((el) => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'), { passive: true });
      el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'), { passive: true });
    });
  }

  /* ── TYPING EFFECT ── */
  const roles = ['Software Engineer', 'DevOps Engineer', 'Cloud Engineer', 'Full-Stack Developer'];
  const typedEl = document.getElementById('typed');
  if (typedEl) {
    let roleIndex = 0, charIndex = 0, deleting = false;

    function type() {
      const current = roles[roleIndex];
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
        setTimeout(() => { deleting = true; type(); }, 2300);
        return;
      }
      setTimeout(type, 78);
    }
    setTimeout(type, 1600);
  }

  /* ── SCROLL REVEAL ── */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      if (entry.target.classList.contains('skill-cat')) {
        entry.target.querySelectorAll('.badge').forEach((badge, i) => {
          badge.style.transition = `opacity 0.42s ease ${i * 0.055}s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.055}s`;
          setTimeout(() => badge.classList.add('pop'), i * 55);
        });
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -55px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  /* ── 3D TILT ── */
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg) translateZ(6px)`;
    }, { passive: true });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateY(0) rotateX(0) translateZ(0)';
    });
  });

  /* ── NAV SCROLL + ACTIVE LINK ── */
  const nav = document.getElementById('nav');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  const sections = document.querySelectorAll('section[id]');
  let scrollTick = false;

  window.addEventListener('scroll', () => {
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      nav.classList.toggle('scrolled', window.scrollY > 60);
      let current = '';
      sections.forEach((s) => { if (window.scrollY >= s.offsetTop - 130) current = s.id; });
      navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current}`));
      scrollTick = false;
    });
  }, { passive: true });

  /* ── MOBILE MENU ── */
  const burger = document.getElementById('burger');
  const mobMenu = document.getElementById('mob-menu');
  if (burger && mobMenu) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      mobMenu.classList.toggle('open');
    });
    mobMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      burger.classList.remove('open');
      mobMenu.classList.remove('open');
    }));
  }

  /* ── SMOOTH SCROLL ── */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ── KONAMI CODE ── */
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIndex = 0;
  document.addEventListener('keydown', (e) => {
    konamiIndex = e.key === KONAMI[konamiIndex] ? konamiIndex + 1 : 0;
    if (konamiIndex === KONAMI.length) { konamiIndex = 0; launchKonami(); }
  });

  function launchKonami() {
    const overlay = document.getElementById('konami-overlay');
    const canvas = document.getElementById('konami-canvas');
    if (!overlay || !canvas) return;
    const kx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    overlay.classList.add('on');

    const COLORS = ['#7c6cf7', '#22d3ee', '#fb7185', '#fbbf24', '#f97316', '#34d399'];
    let particles = Array.from({ length: 320 }, () => ({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 22,
      vy: (Math.random() - 0.5) * 22 - 9,
      r: Math.random() * 7 + 2,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      a: 1,
      g: 0.3 + Math.random() * 0.25,
    }));

    (function animate() {
      kx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
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
      particles = particles.filter((p) => p.a > 0);
      if (particles.length) requestAnimationFrame(animate);
      else overlay.classList.remove('on');
    })();

    const toast = Object.assign(document.createElement('div'), {
      innerHTML: `<div style="font-size:2.8rem;margin-bottom:10px">🎮</div>
      <div style="font-size:1.4rem;font-weight:700;background:linear-gradient(135deg,#7c6cf7,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">+30 Lives Unlocked!</div>
      <div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:7px">Easter egg found 🥚</div>`,
    });
    Object.assign(toast.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: '9992', textAlign: 'center', pointerEvents: 'none',
      fontFamily: "'Space Grotesk',sans-serif", color: '#fff',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }
})();
