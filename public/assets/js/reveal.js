/**
 * Scroll-reveal animations.
 *
 * Elements marked `.reveal` fade/slide in when they enter the viewport
 * (once). Use data-reveal="left|right|scale|blur" to pick a direction and
 * data-reveal-delay="150" to stagger. Groups marked `.stagger` reveal
 * their children one after another. Everything is disabled automatically
 * when the user prefers reduced motion (see animations.css).
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (REDUCED) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;

      var el = entry.target;

      var delay = el.getAttribute('data-reveal-delay');
      if (delay) {
        el.style.transitionDelay = delay + 'ms';
      }

      if (el.classList.contains('stagger')) {
        el.classList.add('in');
        Array.prototype.forEach.call(el.children, function (child, i) {
          child.style.transitionDelay = i * 70 + 'ms';
        });
      } else {
        el.classList.add('in');
      }

      // Skill categories pop their badges in sequence once visible.
      if (el.classList.contains('skill-cat')) {
        var badges = el.querySelectorAll('.badge');
        Array.prototype.forEach.call(badges, function (badge, i) {
          badge.style.transition = 'opacity 0.42s ease ' + i * 0.055 + 's, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) ' + i * 0.055 + 's, border-color 0.25s, color 0.25s, background 0.25s, box-shadow 0.25s';
          setTimeout(function () { badge.classList.add('pop'); }, i * 55);
        });
      }

      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

  document.querySelectorAll('.reveal, .stagger').forEach(function (el) {
    observer.observe(el);
  });
})();
