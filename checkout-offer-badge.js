(() => {
    'use strict';

    function mount() {
        const heading = document.getElementById('selectedPlanName');
        const offers = document.getElementById('ndcSignupOffer');
        if (!heading || !offers || document.getElementById('ndcLeftOfferBadge')) return;

        const badge = document.createElement('div');
        badge.id = 'ndcLeftOfferBadge';
        badge.hidden = true;
        badge.setAttribute('role', 'status');
        badge.style.cssText =
            'width:fit-content;margin:0 0 20px;padding:6px 11px;' +
            'border:1px solid rgba(215,189,85,.35);border-radius:8px;' +
            'background:rgba(215,189,85,.09);color:var(--gold,#d7bd55);' +
            'font:600 12px/1.5 var(--portfolio-ui,sans-serif);';

        heading.after(badge);

        function sync() {
            const result = offers.querySelector('.ndc-offer-result');
            const source = result?.querySelector('.ndc-offer-badge');
            const text = result && !result.hidden
                ? source?.textContent.trim() || ''
                : '';

            if (badge.textContent !== text) badge.textContent = text;
            badge.hidden = !text;
        }

        new MutationObserver(sync).observe(offers, {
            childList:true,
            subtree:true,
            characterData:true,
            attributes:true,
            attributeFilter:['hidden']
        });

        sync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();