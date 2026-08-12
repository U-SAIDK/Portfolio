/**
 * Hero background — a lightweight connected-particle field that reacts to
 * the cursor. Pauses itself whenever the hero section is off-screen or the
 * tab is hidden so it never burns CPU in the background, recolours itself
 * when the theme changes, and stays off entirely for reduced-motion users.
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.getElementById('particle-canvas');
  var hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  var ctx = canvas.getContext('2d');
  var W, H, pts = [];
  var mouse = { x: null, y: null };
  var active = true;
  var frame = 0;

  function hexToRgb(hex, fallback) {
    var value = String(hex || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!m) return fallback;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  function brandColors() {
    var cs = getComputedStyle(document.documentElement);
    return {
      primary: hexToRgb(cs.getPropertyValue('--primary'), [124, 108, 247]),
      secondary: hexToRgb(cs.getPropertyValue('--secondary'), [34, 211, 238]),
    };
  }

  function sizeCanvas() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = hero.offsetHeight;
  }
  sizeCanvas();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { sizeCanvas(); buildPts(); }, 200);
  }, { passive: true });

  document.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  var colors = brandColors();
  document.documentElement.addEventListener('uk-themechange', function () {
    colors = brandColors();
  });

  function Pt() {
    var primary = colors.primary, secondary = colors.secondary;
    var hue = Math.random();
    this.bx = this.x = Math.random() * W;
    this.by = this.y = Math.random() * H;
    this.vx = (Math.random() - 0.5) * 0.45;
    this.vy = (Math.random() - 0.5) * 0.45;
    this.r = Math.random() * 1.8 + 0.4;
    this.a = Math.random() * 0.5 + 0.1;
    this.c = (hue > 0.55 ? primary : secondary).join(',');
  }
  Pt.prototype.tick = function () {
    if (mouse.x !== null) {
      var dx = mouse.x - this.x, dy = mouse.y - this.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 19600) {
        var f = (140 - Math.sqrt(d2)) / 140;
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
  };
  Pt.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(' + this.c + ',0.7)';
    ctx.fillStyle = 'rgba(' + this.c + ',' + this.a + ')';
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  function buildPts() {
    var mobile = window.innerWidth < 768;
    var density = mobile ? 14000 : 8000;
    var cap = mobile ? 50 : 110;
    pts = Array.from({ length: Math.min(Math.floor((W * H) / density), cap) }, function () { return new Pt(); });
  }
  buildPts();

  var D2_CONNECT = 95 * 95;
  function connectPts() {
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < D2_CONNECT) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = 'rgba(' + colors.primary.join(',') + ',' + ((1 - Math.sqrt(d2) / 95) * 0.15) + ')';
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
    pts.forEach(function (p) { p.tick(); p.draw(); });
    if (++frame % 2 === 0) connectPts();
  })();

  var heroObserver = new IntersectionObserver(function (entries) { active = entries[0].isIntersecting; }, { threshold: 0 });
  heroObserver.observe(hero);
  document.addEventListener('visibilitychange', function () { active = !document.hidden; });
})();
