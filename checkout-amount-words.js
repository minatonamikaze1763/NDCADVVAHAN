(() => {
  'use strict';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(n) {
    if (n < 20) return ones[n] || 'Zero';
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    for (const [unit, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]) {
      if (n >= unit) return words(Math.floor(n / unit)) + ' ' + label + (n % unit ? ' ' + words(n % unit) : '');
    }
  }
  function mount() {
    const amount = document.getElementById('selectedPlanAmount');
    if (!amount || document.getElementById('ndcPayableWords')) return;
    const caption = document.createElement('small'); caption.id = 'ndcPayableWords'; caption.className = 'ndc-amount-words';
    caption.setAttribute('aria-live', 'polite'); caption.setAttribute('aria-atomic', 'true'); amount.after(caption);
    function refresh() {
      const text = amount.textContent.trim();
      const match = text.replace(/,/g, '').match(/(?:\u20b9|INR)\s*(\d+(?:\.\d{1,2})?)/i);
      const value = match ? Number(match[1]) : NaN;
      if (!Number.isFinite(value) || value < 0 || value > 999999999) { caption.textContent = ''; caption.hidden = true; return; }
      const paiseTotal = Math.round(value * 100), rupees = Math.floor(paiseTotal / 100), paise = paiseTotal % 100;
      caption.hidden = false;
      caption.textContent = words(rupees) + (rupees === 1 ? ' Rupee' : ' Rupees') + (paise ? ' and ' + words(paise) + (paise === 1 ? ' Paisa' : ' Paise') : '') + ' Only';
    }
    new MutationObserver(refresh).observe(amount, {childList:true, characterData:true, subtree:true}); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();