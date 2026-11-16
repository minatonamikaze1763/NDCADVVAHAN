(() => {
    'use strict';

    function mount() {
        const container = document.querySelector('#payment .payment-container');
        if (!container || container.querySelector('.ndc-summary-rail')) return;

        const summary = container.querySelector(':scope > .payment-summary');
        if (!summary) return;

        const rail = document.createElement('div');
        rail.className = 'ndc-summary-rail';
        summary.before(rail);
        rail.append(summary);

        const header = document.querySelector('.topbar');

        function updateOffset() {
            const bottom = header?.getBoundingClientRect().bottom || 82;
            const top = Math.max(16, bottom + 20);
            summary.style.top = top + 'px';
            summary.style.maxHeight =
                'calc(100dvh - ' + (top + 20) + 'px)';

            if (window.matchMedia('(max-width:760px)').matches) {
                summary.style.removeProperty('top');
                summary.style.removeProperty('max-height');
            }
        }

        updateOffset();
        window.addEventListener('resize', updateOffset, { passive:true });

        if (header && typeof ResizeObserver === 'function') {
            new ResizeObserver(updateOffset).observe(header);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();