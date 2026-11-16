(() => {
    'use strict';

    function moveDuration() {
        const section = document.getElementById('payment');
        if (!section) return false;

        if (section.querySelector('.ndc-summary-duration')) return true;

        const select = document.getElementById('signupMonths');
        const field = select?.closest('.credential-field');
        const tiles = field?.querySelector('.ndc-month-tiles');
        const summary = section.querySelector('.payment-summary');

        if (!select || !field || !tiles || !summary) return false;

        const panel = document.createElement('div');
        panel.className = 'ndc-summary-duration';

        const title = document.createElement('h4');
        title.id = 'ndcSummaryDurationLabel';
        title.textContent = 'Choose your duration';

        tiles.setAttribute('aria-labelledby', title.id);
        panel.append(title, tiles);
        summary.append(panel);

        // Keep the original select inside the signup form.
        // Existing payment, offer and busy-state handling still uses it.
        field.classList.add('ndc-duration-original');
        field.hidden = true;

        return true;
    }

    function start() {
        if (moveDuration()) return;

        // Signup builds the tiles after the plan catalog finishes loading.
        const target = document.getElementById('payment');
        if (!target) return;

        const observer = new MutationObserver(() => {
            if (moveDuration()) observer.disconnect();
        });

        observer.observe(target, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();