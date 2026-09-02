(function () {
  'use strict';

  const themeStyle = document.getElementById('theme-style');
  const themeToggle = document.getElementById('theme-toggle');
  const langToggle = document.getElementById('lang-toggle');

  // Validate elements exist
  if (!themeStyle || !themeToggle || !langToggle) {
    console.warn('Required DOM elements not found');
    return;
  }

  const state = {
    lang: localStorage.getItem('lang') || 'en',
    theme: localStorage.getItem('theme') || 'light'
  };

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    themeStyle.setAttribute('href', isDark ? 'colorsDark.css' : 'colorsLight.css');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    state.theme = theme;
  }

  function getByPath(obj, path) {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, key) => {
      return acc && typeof acc === 'object' && key in acc ? acc[key] : null;
    }, obj);
  }

  async function applyLanguage(lang) {
    try {
      const file = lang === 'ar' ? 'textsAR.json' : 'textsEN.json';
      const res = await fetch(file);
      
      if (!res.ok) throw new Error(`Failed to load ${file}`);
      
      const data = await res.json();

      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.setAttribute('data-lang', lang);

      // Update text content
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const value = getByPath(data, key);
        if (value) {
          el.textContent = value;
        }
      });

      // Update alt text
      document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
        const key = el.getAttribute('data-i18n-alt');
        const value = getByPath(data, key);
        if (value) {
          el.setAttribute('alt', value);
        }
      });

      localStorage.setItem('lang', lang);
      state.lang = lang;
    } catch (error) {
      console.error('Error loading language file:', error);
    }
  }

  // Mobile Menu Toggle
  const menuToggle = document.getElementById('menu-toggle');
  const navbarMenu = document.getElementById('navbar-menu');

  if (menuToggle && navbarMenu) {
    menuToggle.addEventListener('click', () => {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', !isOpen);
      navbarMenu.classList.toggle('mobile-open');
    });

    // Close menu when clicking on a link
    navbarMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        menuToggle.setAttribute('aria-expanded', 'false');
        navbarMenu.classList.remove('mobile-open');
      }
    });

    // Close menu when resizing to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        menuToggle.setAttribute('aria-expanded', 'false');
        navbarMenu.classList.remove('mobile-open');
      }
    });
  }

  // Event listeners
  themeToggle.addEventListener('click', () => {
    applyTheme(state.theme === 'light' ? 'dark' : 'light');
  });

  langToggle.addEventListener('click', () => {
    applyLanguage(state.lang === 'en' ? 'ar' : 'en');
  });

  // Initialize
  applyTheme(state.theme);
  applyLanguage(state.lang);

  // Optimize performance: preload critical resources
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Additional optimizations can go here
    });
  }
})();
