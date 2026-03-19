(function () {
  'use strict';

  // ── Sticky nav shadow on scroll ──
  const nav = document.getElementById('site-nav');
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── Mobile burger menu ──
  const burger = document.querySelector('.nav-burger');
  const navLinks = document.querySelector('.nav-links');

  burger.addEventListener('click', function () {
    const open = navLinks.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
    burger.textContent = open ? '✕' : '☰';
  });

  // Close mobile menu when a link is clicked
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      burger.textContent = '☰';
    });
  });

  // ── Smooth entrance animations ──
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.activity-card, .price-tag, .notepad-card, .dates-card').forEach(function (el) {
      el.classList.add('fade-in');
      observer.observe(el);
    });
  }
}());
