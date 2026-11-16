(() => {
    'use strict';

    function mount() {
        document.body.classList.add('ndc-dashboard-v2');

        const paths = {
            overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
            profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
            setup: '<path d="m9 12 2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/>',
            subscription: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 15h4"/>',
            payments: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
            sessions: '<rect x="2" y="4" width="14" height="12" rx="2"/><path d="M6 20h6M9 16v4"/><rect x="17" y="9" width="5" height="12" rx="1"/>',
            features: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
            security: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
            contact: '<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="2" y="11" width="4" height="7" rx="2"/><rect x="18" y="11" width="4" height="7" rx="2"/><path d="M18 18c0 2-2 3-6 3"/>',
            logout: '<path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h13"/>'
        };
        const icon = name =>
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            (paths[name] || paths.overview) + '</svg>';

        const nav = document.querySelector('.ndc-side-nav');
        nav?.querySelectorAll('button').forEach(button => {
            const span = button.querySelector('span');
            if (span) span.innerHTML = icon(button.dataset.section || 'logout');
        });

        const close = document.getElementById('ndcMenuClose');
        if (close) close.textContent = '\u00d7';

        const toggle = document.getElementById('ndcMenuToggle');
        if (toggle) toggle.textContent = 'Menu';

        const secure = document.querySelector('.ndc-secure-label');
        if (secure) secure.textContent = 'Secure session';

        const support = document.querySelector('.ndc-support-card a');
        if (support) support.textContent = 'Contact support \u2197';

        const eyebrow = document.querySelector('.ndc-portal-topbar .ndc-eyebrow');
        function syncNavigation() {
            nav?.querySelectorAll('[data-section]').forEach(button => {
                const active = button.classList.contains('is-active');
                if (active && button.getAttribute('aria-current') !== 'page') {
                    button.setAttribute('aria-current', 'page');
                } else if (!active && button.hasAttribute('aria-current')) {
                    button.removeAttribute('aria-current');
                }
            });
            const active = nav?.querySelector('[data-section].is-active');
            if (eyebrow && active) {
                eyebrow.textContent = 'CUSTOMER PORTAL / ' +
                    active.textContent.trim().toUpperCase();
            }
        }
        syncNavigation();

        if (nav) {
            new MutationObserver(syncNavigation).observe(nav, {
                subtree:true,
                attributes:true,
                attributeFilter:['class']
            });
        }

        const main = document.querySelector('.ndc-portal-main');
        const content = document.getElementById('ndcDashboardContent');
        if (main && content && !document.querySelector('.ndc-dashboard-shortcuts')) {
            const shortcuts = document.createElement('nav');
            shortcuts.className = 'ndc-dashboard-shortcuts';
            shortcuts.setAttribute('aria-label', 'Account shortcuts');

            for (const [section, label] of [
                ['subscription', 'Manage subscription'],
                ['payments', 'Payment history'],
                ['setup', 'Setup guide']
            ]) {
                const existing = nav?.querySelector('[data-section="' + section + '"]');
                if (!existing) continue;
                const button = document.createElement('button');
                button.type = 'button';
                button.innerHTML = icon(section);
                const text = document.createElement('span');
                text.textContent = label;
                button.append(text);
                button.onclick = () => existing.click();
                shortcuts.append(button);
            }
            content.before(shortcuts);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();