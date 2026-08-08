/**
 * Hero background — a lightweight connected-particle field that reacts to
 * the cursor. Pauses itself whenever the hero section is off-screen or the
 * tab is hidden so it never burns CPU in the background.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('particle-canvas');
  const hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d');
  let W, H, pts = [];
  const mouse = { x: null, y: null };
  let active = true;
  let frame = 0;

  function sizeCanvas() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = hero.offsetHeight;
  }
  sizeCanvas();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { sizeCanvas(); buildPts(); }, 200);
  }, { passive: true });

  document.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  class Pt {
    constructor() { this.reset(); }
    reset() {
      this.bx = this.x = Math.random() * W;
      this.by = this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.45;
      this.vy = (Math.random() - 0.5) * 0.45;
      this.r = Math.random() * 1.8 + 0.4;
      this.a = Math.random() * 0.5 + 0.1;
      this.c = Math.random() > 0.55 ? '124,108,247' : '34,211,238';
    }
    tick() {
      if (mouse.x !== null) {
        const dx = mouse.x - this.x, dy = mouse.y - this.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 19600) {
          const f = (140 - Math.sqrt(d2)) / 140;
          this.x -= dx * f * 0.035;
          this.y -= dy * f * 0.035;
        }
      }
      this.x += (this.bx - this.x) * 0.018;
      this.y += (this.by - this.y) * 0.018;
      this.bx += this.vx;
      this.by += this.vy;
      if (this.bx < 0) this.bx = W;
      if (this.bx > W) this.bx = 0;
      if (this.by < 0) this.by = H;
      if (this.by > H) this.by = 0;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${this.c},0.7)`;
      ctx.fillStyle = `rgba(${this.c},${this.a})`;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function buildPts() {
    const mobile = window.innerWidth < 768;
    const density = mobile ? 14000 : 8000;
    const cap = mobile ? 50 : 110;
    pts = Array.from({ length: Math.min(Math.floor((W * H) / density), cap) }, () => new Pt());
  }
  buildPts();

  const D2_CONNECT = 95 * 95;
  function connectPts() {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < D2_CONNECT) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(124,108,247,${(1 - Math.sqrt(d2) / 95) * 0.15})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  }

  (function animate() {
    requestAnimationFrame(animate);
    if (!active) return;
    ctx.clearRect(0, 0, W, H);
    pts.forEach((p) => { p.tick(); p.draw(); });
    if (++frame % 2 === 0) connectPts();
  })();

  const heroObserver = new IntersectionObserver((entries) => { active = entries[0].isIntersecting; }, { threshold: 0 });
  heroObserver.observe(hero);
  document.addEventListener('visibilitychange', () => { active = !document.hidden; });
})();
