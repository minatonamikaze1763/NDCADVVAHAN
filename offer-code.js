(() => {
  'use strict';
  window.NDCOfferCode = { mount(root, { request, onApply, onClear, isBusy = () => false }) {
    root.className = 'ndc-offer-code';
    root.innerHTML = '<label class="ndc-offer-label">Have an offer code? <span>Optional</span><div class="ndc-offer-entry"><input type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Enter your offer code" aria-label="Offer code"><button type="button" data-offer-apply>Apply code</button><button type="button" data-offer-clear hidden>Remove</button></div></label><p class="ndc-offer-status" role="status" aria-live="polite"></p><div class="ndc-offer-result" hidden></div>';
    const input = root.querySelector('input'), apply = root.querySelector('[data-offer-apply]'), clear = root.querySelector('[data-offer-clear]'), status = root.querySelector('[role="status"]'), result = root.querySelector('.ndc-offer-result');
    let revision = 0, loading = false, applied = false;
    const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
    function setBusy(value) { input.disabled = apply.disabled = clear.disabled = value || loading; }
    function reset(message = '') { revision++; applied = false; result.hidden = true; result.replaceChildren(); clear.hidden = true; input.value = ''; status.textContent = message; onClear(); }
    function render(offer) {
      result.replaceChildren();
      const badge = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('p'), facts = document.createElement('div'), rules = document.createElement('p');
      badge.className = 'ndc-offer-badge'; badge.textContent = `${offer.code} applied`;
      title.textContent = offer.title; description.textContent = offer.description; facts.className = 'ndc-offer-facts';
      for (const [label, value] of [['Plan & duration', `${offer.planName} · ${offer.months} months (${offer.durationDays} days)`], ['You save', money(offer.discountPaise)], ['You pay', money(offer.amountPaise)], ['Device logins', String(offer.maxDevices)]]) {
        const cell = document.createElement('div'), small = document.createElement('small'), strong = document.createElement('b'); small.textContent = label; strong.textContent = value; cell.append(small, strong); facts.append(cell);
      }
      rules.className = 'ndc-offer-terms'; rules.textContent = `${offer.retainDevicesOnRenewal ? `Extra devices continue on ${offer.planName} renewals at the regular ${money(offer.monthlyPrice * 100)}/month. ` : 'Extra devices apply to this purchased period. '}The discount applies once. ${offer.rules || ''}`;
      result.append(badge, title, description, facts, rules); result.hidden = false;
    }
    apply.onclick = async () => {
      if (loading || isBusy()) return;
      const code = input.value.trim().toUpperCase();
      if (!code) { status.textContent = 'Enter an offer code to apply.'; return; }
      const current = ++revision; loading = true; setBusy(true); status.textContent = 'Checking your offer…';
      try {
        const data = await request(code);
        if (current !== revision || !root.isConnected || isBusy()) return;
        const offer = data.offer; if (!offer?.planId || !Number.isInteger(offer.months)) throw Error('Could not read this offer. Try again.');
        onApply(offer); applied = true; input.value = offer.code; clear.hidden = false; render(offer);
        status.textContent = 'Offer applied. The required plan and duration are selected for you.';
      } catch (error) { if (current === revision && root.isConnected) { applied = false; result.hidden = true; clear.hidden = false; onClear(); status.textContent = error.message; } }
      finally { loading = false; setBusy(isBusy()); }
    };
    input.addEventListener('input', () => { revision++; if (applied) { applied = false; result.hidden = true; clear.hidden = true; onClear(); } status.textContent = ''; });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); apply.click(); } });
    clear.onclick = () => { if (!isBusy()) reset('Offer removed. Standard pricing applies.'); };
    return { applyCode: async code => { if (loading || isBusy()) return false; input.value = code; await apply.onclick(); return applied; }, setBusy, clear: reset, isLoading: () => loading, hasUnapplied: () => !!input.value.trim() && !applied };
  } };
})();
