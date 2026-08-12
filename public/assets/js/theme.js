/**
 * Theme system — dark / light toggle.
 *
 * The initial theme is decided by an inline script in <head> (so there is
 * no flash of the wrong theme): stored preference > system preference >
 * light. This file wires up the toggle buttons, persists the choice and
 * notifies other modules (e.g. the hero particles) when it changes.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'uk-theme';
  var THEME_META = { light: '#f5f6fb', dark: '#06060f' };

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch (_) { /* private mode — keep the in-memory theme */ }
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META[theme]);

    // Cross-fade the page colours while toggling.
    root.classList.add('theme-anim');
    clearTimeout(root._themeAnimTimer);
    root._themeAnimTimer = setTimeout(function () {
      root.classList.remove('theme-anim');
    }, 420);

    // Let other modules (particles) recolour themselves.
    root.dispatchEvent(new CustomEvent('uk-themechange', { detail: { theme: theme } }));
  }

  function updateToggleLabels() {
    var isDark = currentTheme() === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
      updateToggleLabels();
    });
  });

  updateToggleLabels();
})();
