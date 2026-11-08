'use strict';
(() => {
  const root = document.querySelector('.ndc-redesign');
  if (!root) return;
  const nav = document.getElementById('primaryNav');
  const menu = document.getElementById('menuToggle');
  const more = document.querySelector('.ndc-nav-more');
  const closeNav = () => {
    nav?.classList.remove('is-open');
    menu?.setAttribute('aria-expanded', 'false');
    menu?.setAttribute('aria-label', 'Open navigation');
    if (more) more.open = false;
  };
  document.addEventListener('click', event => {
    if (more?.open && !more.contains(event.target)) more.open = false;
    if (nav?.contains(event.target) && event.target.closest('a')) closeNav();
    if (!event.target.closest('.topbar')) closeNav();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (more?.open || nav?.classList.contains('is-open'))) {
      closeNav();
      if (getComputedStyle(menu).display !== 'none') menu.focus();
      else more?.querySelector('summary')?.focus();
    }
  });
  // Align the existing menu's resize behavior with this design's breakpoint.
  matchMedia('(min-width: 1181px)').addEventListener('change', event => { if (event.matches) closeNav(); });
  const passwordToggle = document.querySelector('.ndc-password-toggle');
  passwordToggle?.addEventListener('click', () => {
    const password = document.getElementById('ndcLoginPassword');
    const reveal = password.type === 'password';
    password.type = reveal ? 'text' : 'password';
    passwordToggle.textContent = reveal ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    passwordToggle.setAttribute('aria-pressed', String(reveal));
  });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window) || reduce.matches) return;
  const nodes = root.querySelectorAll('.ndc-hero-content, .ndc-workspace-scene, main > section > .container > .section-head, .feature, .step, .ndc-release-card, .ndc-access-card, .ndc-security-note, .ndc-company-card');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('ndc-in');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.05 });
  nodes.forEach(node => { node.classList.add('ndc-enter'); observer.observe(node); });
  reduce.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    nodes.forEach(node => node.classList.remove('ndc-enter'));
  });
})();

// An illustrative selector; this never requests access to customer files.
(() => {
  const button = document.getElementById('customerDemoSelectAll');
  const count = document.getElementById('customerDemoCount');
  const files = [...document.querySelectorAll('[data-customer-demo-file]')];
  if (!button || !count || !files.length) return;
  const update = () => {
    const selected = files.filter(file => file.checked).length;
    count.textContent = `${selected} / ${files.length} selected`;
    button.textContent = selected === files.length ? 'Deselect all documents' : 'Select all documents';
  };
  button.addEventListener('click', () => {
    const checked = !files.every(file => file.checked);
    files.forEach(file => { file.checked = checked; });
    update();
  });
  files.forEach(file => file.addEventListener('change', update));
  update();
})();
