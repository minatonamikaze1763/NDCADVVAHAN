(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('ndcOffersCards');
    if (!root) return;
    const status = document.getElementById('ndcOffersStatus'), more = document.getElementById('ndcOffersMore'), retry = document.getElementById('ndcOffersRetry');
    let offers = [], page = 0, total = 0, busy = false, clockOffset = 0;
    const node = (tag, value, className) => { const n = document.createElement(tag); if (value != null) n.textContent = value; if (className) n.className = className; return n; };
    const money = (paise, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(paise / 100);
    const effects = ['pulse','shine'];
    for(let i=effects.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[effects[i],effects[j]]=[effects[j],effects[i]];}
    const effectById=new Map();
    const endDate = value => new Date(Date.parse(value) - 1).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
    function render() {
      const now = Date.now() + clockOffset;
      const live = offers.filter(o => Date.parse(o.startsAt) <= now && Date.parse(o.endsAt) > now);
      root.replaceChildren();
      for (const offer of live) {
        const card = node('article', null, 'ndc-offer-showcard');
        const key=offer.offerId||offer.code;
        if(!effectById.has(key))effectById.set(key,{name:effects[effectById.size%effects.length],delay:-(Math.random()*8),duration:8+Math.random()*4});
        const effect=effectById.get(key);card.dataset.effect=effect.name;card.style.setProperty('--offer-delay',effect.delay+'s');card.style.setProperty('--offer-duration',effect.duration+'s');
        const decoration=node('span',null,'ndc-offer-decoration');decoration.setAttribute('aria-hidden','true');card.append(decoration);
        const top = node('div', null, 'ndc-offer-card-top'); top.append(node('span', 'LIVE OFFER', 'ndc-offers-eyebrow'), node('span', `Save ${money(offer.discountPaise, offer.currency)}`, 'ndc-offer-saving'));
        const heading = node('h3', offer.title), description = node('p', offer.description, 'ndc-offer-description');
        const price = node('div', null, 'ndc-offer-showprice');
        price.append(node('strong', money(offer.amountPaise, offer.currency)), node('del', money(offer.subtotalPaise, offer.currency)), node('span', `${offer.planName} · ${offer.months} months · ${offer.durationDays} days`));
        const benefits = node('ul', null, 'ndc-offer-benefits');
        for (const text of [`${offer.maxDevices} device logins${offer.extraDevices ? ` · ${offer.extraDevices} extra included` : ''}`, offer.retainDevicesOnRenewal ? `Extra devices stay on ${offer.planName} renewals at the regular ${money(offer.monthlyPrice * 100, offer.currency)}/month.` : 'Any extra devices apply to this purchased period.', 'One-time purchase discount. One redemption per account.']) benefits.append(node('li', text));
        const codeRow = node('div', null, 'ndc-offer-public-code'), code = node('code', offer.code), copy = node('button', 'Copy code'); copy.type = 'button';copy.setAttribute('aria-label', 'Copy offer code ' + offer.code);codeRow.append(code, copy);
        const notice = node('p', '', 'ndc-offer-card-notice'); notice.setAttribute('role', 'status');
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(offer.code); notice.textContent = 'Code copied. Apply it before payment.'; }
          catch { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range); notice.textContent = 'Select and copy the highlighted code.'; }
        };
        const use = node('button', 'Use this offer ↗', 'btn btn-primary'); use.type = 'button';
        use.onclick = async () => {
          if (Date.now() + clockOffset >= Date.parse(offer.endsAt)) { notice.textContent = 'This offer has ended. Refresh to see current offers.'; return; }
          if (typeof window.NDCApplySignupOffer !== 'function') { notice.textContent = 'Checkout is still loading. Please try again shortly.'; return; }
          use.disabled = true;
          try { const applied = await window.NDCApplySignupOffer(offer.code); notice.textContent = applied ? 'Offer applied at signup. Review your details before payment.' : 'Could not apply this offer. Check the checkout message or sign in to renew.'; }
          catch { notice.textContent = 'Unable to apply the offer. Please try again.'; }
          finally { use.disabled = false; }
        };
        const validity = node('p', `Valid through ${endDate(offer.endsAt)}`, 'ndc-offer-validity');
        const rules = node('details', null, 'ndc-offer-public-rules'); rules.append(node('summary', 'Offer rules & conditions'), node('p', offer.rules || 'One redemption per account. Existing account eligibility rules apply.'));
        card.append(top, heading, description, price, benefits, codeRow, use, notice, validity, rules);root.append(card);
      }
      status.textContent = live.length ? `${live.length} active offer${live.length === 1 ? '' : 's'} shown. Prices and eligibility are confirmed at checkout.` : 'No active offers right now. New offers will appear here when available.';
      more.hidden = page * 50 >= total;
    }
    async function load(reset = false) {
      if (busy) return;busy = true;more.disabled = retry.disabled = true;retry.hidden = true;
      status.textContent = reset ? 'Loading current offers…' : 'Loading more offers…';
      try {
        const next = reset ? 1 : page + 1;
        const response = await fetch(`https://server.nextdimensioncustoms.in/api/public/offers?page=${next}`, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error('Offers are temporarily unavailable.');
        const data = await response.json();
        if (!Array.isArray(data.records)) throw Error('Offers are temporarily unavailable.');
        const serverTime = Date.parse(data.serverTime); if (Number.isFinite(serverTime)) clockOffset = serverTime - Date.now();
        offers = reset ? data.records : [...offers, ...data.records.filter(o => !offers.some(old => old.offerId === o.offerId))];
        page = next; total = Number(data.total) || 0;render();
      } catch { status.textContent = 'We couldn’t load current offers. Please try again. Offer codes can still be checked at checkout.';retry.hidden = false; }
      finally { busy = false; more.disabled = retry.disabled = false; }
    }
    more.onclick = () => load(); retry.onclick = () => load(page === 0);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(true); });
    // Remove expired cards even if a visitor leaves this page open.
    setInterval(() => { if (!busy && offers.some(o => Date.parse(o.endsAt) <= Date.now() + clockOffset)) render(); }, 30000);
    void load(true);
  });
})();
