(() => {
    'use strict';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five',
        'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
        'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
        'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty',
        'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function words(n) {
        if (n < 20) return ones[n] || 'Zero';
        if (n < 100) return tens[Math.floor(n / 10)] +
            (n % 10 ? ' ' + ones[n % 10] : '');

        for (const [unit, label] of [
            [10000000, 'Crore'], [100000, 'Lakh'],
            [1000, 'Thousand'], [100, 'Hundred']
        ]) {
            if (n >= unit) return words(Math.floor(n / unit)) +
                ' ' + label + (n % unit ? ' ' + words(n % unit) : '');
        }
    }

    function syncAmount() {
        const preview = document.getElementById('ndcRenewalPreview');
        const total = preview?.querySelector('.ndc-preview-total');
        const amount = total?.querySelector('strong');
        if (!preview || !total || !amount) return;

        let caption = preview.querySelector('.ndc-renewal-amount-words');
        const match = amount.textContent.replace(/,/g, '')
            .match(/(?:\u20b9|INR)\s*(\d+(?:\.\d{1,2})?)/i);
        const value = match ? Number(match[1]) : NaN;

        if (!Number.isFinite(value) || value < 0 || value > 999999999) {
            if (caption) caption.remove();
            return;
        }

        const totalPaise = Math.round(value * 100);
        const rupees = Math.floor(totalPaise / 100);
        const paise = totalPaise % 100;
        const text = words(rupees) +
            (rupees === 1 ? ' Rupee' : ' Rupees') +
            (paise ? ' and ' + words(paise) +
                (paise === 1 ? ' Paisa' : ' Paise') : '') +
            ' Only';

        if (!caption) {
            caption = document.createElement('p');
            caption.className = 'ndc-renewal-amount-words';
            total.after(caption);
        }
        if (caption.textContent !== text) caption.textContent = text;
    }

    function mount() {
        const content = document.getElementById('ndcDashboardContent');
        if (!content) return;
        syncAmount();

        // Observe the displayed preview; do not change prices or payment state.
        new MutationObserver(syncAmount).observe(content, {
            childList:true,
            characterData:true,
            subtree:true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();