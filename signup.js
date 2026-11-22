(() => {
    'use strict';
    const API = 'https://server.nextdimensioncustoms.in', KEY = 'ndcSignupCompletionV2', plans = {}, $ = id => document.getElementById(id);
    const money = (n, c = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: c }).format(n);
    let selected = null, state = 'idle', saved = null, dialog = null;
    let appliedOffer = null, offerWidget = null, cloudAddonPlans = {};
    let checkoutGst = { enabled: false, gstRate: 18 }, orderQuote = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { }
    const status = t => { $('ndcSignupStatus').textContent = t; };
    const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(saved)); } catch { } };
    function syncCloudChoices() {
        const choices = $('signupCloudChoices');
        if (!choices) return;
        const selectedId = $('signupCloudAddon')?.value || '';
        choices.querySelectorAll('.ndc-cloud-choice').forEach(choice => {
            const isSelected = choice.dataset.planId === selectedId;
            choice.setAttribute('aria-pressed', String(isSelected));
            choice.classList.toggle('is-selected', isSelected);
            choice.disabled = state !== 'idle';
            const stateLabel = choice.querySelector('.ndc-cloud-choice-state');
            if (stateLabel) stateLabel.textContent = isSelected ? 'Selected' : 'Select';
        });
    }
    function renderCloudChoices() {
        const choices = $('signupCloudChoices');
        const cloudSelect = $('signupCloudAddon');
        if (!choices || !cloudSelect) return;
        choices.replaceChildren();
        const options = [{ id: '', name: 'No cloud storage', price: 'Optional add-on', detail: 'Continue with your NDC plan only' },
            ...Object.values(cloudAddonPlans).map(plan => ({
                id: plan.id,
                name: plan.name,
                price: plan.structure === 'flex' ? money(plan.perCustomerPrice) + ' / record / month' : money(plan.monthlyPrice) + ' / month',
                detail: Number(plan.maxCustomersPerMonth).toLocaleString('en-IN') + ' records · 12 document slots per record'
            }))];
        for (const plan of options) {
            const choice = document.createElement('button');
            choice.type = 'button';
            choice.className = 'ndc-cloud-choice';
            choice.dataset.planId = plan.id;
            choice.setAttribute('aria-pressed', 'false');
            const top = document.createElement('span');
            top.className = 'ndc-cloud-choice-top';
            const name = document.createElement('strong');
            name.className = 'ndc-cloud-choice-name';
            name.textContent = plan.name;
            const selectedMark = document.createElement('span');
            selectedMark.className = 'ndc-cloud-choice-state';
            selectedMark.textContent = 'Select';
            top.append(name, selectedMark);
            const price = document.createElement('span');
            price.className = 'ndc-cloud-choice-price';
            price.textContent = plan.price;
            const detail = document.createElement('span');
            detail.className = 'ndc-cloud-choice-detail';
            detail.textContent = plan.detail;
            choice.append(top, price, detail);
            choice.addEventListener('click', () => {
                if (state !== 'idle') return;
                cloudSelect.value = plan.id;
                orderQuote = null;
                update();
            });
            choices.append(choice);
        }
        syncCloudChoices();
    }
    function update() {
        const p = plans[selected], m = Number($('signupMonths').value) || 1;
        const cloudAddonPlanId = $('signupCloudAddon')?.value || null;
        const cloudAddon = cloudAddonPlans[cloudAddonPlanId] || null;
        const quantityInput = $('signupCloudAddonQuantity');
        const cloudQuantity = cloudAddon?.structure === 'flex' ? Math.max(1, Number(quantityInput?.value) || 1) : null;
        const cloudMonthlyAmount = !cloudAddon ? 0 : cloudAddon.structure === 'flex' ? Number(cloudAddon.perCustomerPrice) * cloudQuantity : Number(cloudAddon.monthlyPrice);
        const cloudAmount = cloudMonthlyAmount * m;
        const amount = (appliedOffer ? appliedOffer.amountPaise / 100 : p?.monthlyPrice * m) + cloudAmount;
        const tax = checkoutGst.enabled && p ? Math.round(amount * checkoutGst.gstRate) / 100 : 0;
        const payable = orderQuote?.amount ?? amount + tax;
        const displayBase = orderQuote?.baseAmount ?? amount;
        const displayList = orderQuote?.listPrice ?? ((p ? p.monthlyPrice * m : amount) + cloudAmount);
        const cloudListAmount = cloudAddon ? Math.min(cloudAmount, displayList) : 0;
        const planListAmount = Math.max(0, displayList - cloudListAmount);
        const displayDiscount = orderQuote?.discountAmount ?? Math.max(0, displayList - displayBase);
        const displayTax = orderQuote?.taxAmount ?? tax;
        const devices = appliedOffer ? appliedOffer.maxDevices : p?.maxDevices;
        const heading = document.querySelector('.payment-heading p'); if(heading) heading.textContent = p ? 'Review your plan, optional offer, and payment details.' : 'Select a plan above to continue with your payment.';
        $('selectedPlanName').textContent = p ? p.name + ' Plan' : 'No Plan Selected'; $('selectedPlanAmount').textContent = p ? money(payable) : '₹0';
        const taxBox = $('signupTaxBreakdown');
        if (taxBox) {
            taxBox.hidden = !p;
            taxBox.replaceChildren();
            if (p) {
                const totalGstRate = Number(orderQuote?.gstRate || checkoutGst.gstRate) || 18; const splitGstRate = totalGstRate / 2; const cgstAmount = checkoutGst.enabled ? Math.round(displayTax * 50) / 100 : 0; const sgstAmount = checkoutGst.enabled ? Number((displayTax - cgstAmount).toFixed(2)) : 0; const rows = [["Plan amount", planListAmount], ["Cloud plan amount", cloudListAmount], ["Total", displayList], ...(displayDiscount > 0 ? [["Discount / offer applied", displayDiscount]] : []), ["Taxable amount", displayBase], ["CGST (" + splitGstRate + "%)", cgstAmount], ["SGST (" + splitGstRate + "%)", sgstAmount], ["Total GST (" + totalGstRate + "%)", checkoutGst.enabled ? displayTax : 0], ["Total payable", payable]];
                const heading = document.createElement("div"); heading.className = "ndc-checkout-summary-heading"; heading.textContent = "PAYMENT SUMMARY"; taxBox.append(heading);
                const columns = document.createElement("div"); columns.className = "ndc-checkout-summary-columns"; const descCol = document.createElement("span"); descCol.textContent = "DESCRIPTION"; const amountCol = document.createElement("span"); amountCol.textContent = "AMOUNT"; columns.append(descCol, amountCol); taxBox.append(columns);
                for (const [label, value] of rows) { const row = document.createElement("div"); row.className = "ndc-checkout-tax-row" + (label === "Total payable" ? " is-total" : ""); const name = document.createElement("span"); name.textContent = !checkoutGst.enabled && /^(CGST|SGST|Total GST)/.test(label) ? label + " · not charged" : label; const price = document.createElement("strong"); price.textContent = money(value); row.append(name, price); taxBox.append(row); }
                const note = document.createElement("small"); note.className = "ndc-checkout-summary-note"; note.textContent = checkoutGst.enabled ? "GST is calculated after any plan or offer discount." : "GST is currently not charged. The amount shown is the amount you will pay."; taxBox.append(note);
            }
        }
        const gstFields = $('signupGstFields');
        if (gstFields) { gstFields.hidden = false; for (const input of gstFields.querySelectorAll('input,textarea')) { input.disabled = state !== 'idle'; input.required = checkoutGst.enabled && input.id !== 'signupTradeName' && input.id !== 'signupBusinessPhone'; } } $('selectedPlanLogins').textContent = p ? `1 User · ${devices} devices · ${m} month(s)` : 'Choose a subscription plan to continue.';
        if (quantityInput) {
            quantityInput.hidden = cloudAddon?.structure !== 'flex';
            quantityInput.required = cloudAddon?.structure === 'flex';
            if ($('signupCloudQuantityLabel')) $('signupCloudQuantityLabel').hidden = cloudAddon?.structure !== 'flex';
            quantityInput.disabled = state !== 'idle' || cloudAddon?.structure !== 'flex';
            if (cloudAddon?.structure === 'flex') { quantityInput.max = String(cloudAddon.maxCustomersPerMonth); quantityInput.value = String(Math.min(Number(quantityInput.value) || 100, Number(cloudAddon.maxCustomersPerMonth))); quantityInput.min = "1"; }
        }
        const cloudPrice = $('signupCloudPrice'); if (cloudPrice) cloudPrice.textContent = !cloudAddon ? 'No cloud records included without an add-on.' : cloudAddon.structure === 'flex' ? money(cloudAddon.perCustomerPrice) + ' per customer record/month × ' + (cloudQuantity || 1) + ' records · 12 document slots per record' : money(cloudAddon.monthlyPrice) + ' per month · ' + Number(cloudAddon.maxCustomersPerMonth).toLocaleString('en-IN') + ' records · 12 document slots per record';
        $('paymentProceed').disabled = !p || state !== 'idle'; $('paymentProceed').textContent = ['complete', 'review'].includes(state) ? 'Payment received' : state !== 'idle' ? 'Processing…' : p ? 'Pay securely · ' + money(payable) : 'Select a Plan to Continue';
        $('ndcSignupForm').querySelectorAll('input,select').forEach(n => n.disabled = state !== 'idle');
        offerWidget?.setBusy(state !== 'idle');
        syncCloudChoices();
        syncCheckoutUI();
    }
    async function post(path, body) { const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(45000) }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw Error(d.error || d.message || `Request failed (${r.status})`); return d; }
    function show(kind, message) {
        if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'ndcPaymentDialog'; dialog.className = 'ndc-payment-dialog'; dialog.setAttribute('aria-labelledby', 'ndcPaymentTitle'); dialog.innerHTML = '<div id="ndcPaymentSymbol"></div><span class="ndc-eyebrow">SECURE NDC CHECKOUT</span><h2 id="ndcPaymentTitle"></h2><p id="ndcPaymentMessage" role="status" aria-live="polite"></p><div id="ndcPaymentFacts" class="ndc-payment-facts"></div><p id="ndcPaymentEmail"></p><p id="ndcPaymentReloadNote" class="ndc-payment-note"></p><div id="ndcPaymentActions"></div>'; dialog.addEventListener('cancel', e => e.preventDefault()); document.body.append(dialog); }
        const loading = kind === 'loading'; $('ndcPaymentSymbol').className = 'ndc-payment-symbol ' + (loading ? 'is-loading' : kind === 'success' ? 'is-success' : 'is-pending'); $('ndcPaymentSymbol').textContent = loading ? '' : kind === 'success' ? '✓' : '!';
        $('ndcPaymentTitle').textContent = loading ? 'Confirming your payment' : kind === 'success' ? 'Payment successful' : kind === 'review' ? 'Payment received — review required' : 'Confirmation is pending'; $('ndcPaymentMessage').textContent = message;
        const facts = $('ndcPaymentFacts'); facts.replaceChildren(); const p = saved?.purchase || {};
        for (const [label, value] of [['Plan', p.planName], ['Duration', p.months ? `${p.months} month(s) · ${p.months * 30} days` : null], ['Devices', p.maxDevices], ['Amount', p.amount == null ? null : money(p.amount, p.currency || 'INR')], ['Offer', p.offer?.code], ['Referral bonus', p.referralBonusDays ? `+${p.referralBonusDays} days for you and your referrer` : null], ['Payment reference', saved?.proof?.razorpay_payment_id]]) { if (value == null) continue; const div = document.createElement('div'), small = document.createElement('small'), strong = document.createElement('strong'); small.textContent = label; strong.textContent = value; div.append(small, strong); facts.append(div); }
        const sent = ['sent', 'completed'].includes(saved?.setupEmail?.status);
        $('ndcPaymentEmail').textContent = kind === 'success' ? (sent ? `Your setup email was accepted by our email provider. Check ${saved.details.email}, including spam, for your login IDs and secure password setup link.` : `Payment is confirmed. Your setup email is ${saved?.setupEmail?.status === 'failed' ? 'being retried' : 'being prepared'}. Check ${saved.details.email} and spam for your login IDs and password setup link. Use the setup-email recovery form if needed.`) : '';
        $('ndcPaymentReloadNote').textContent = loading ? 'Please wait. Keep this page open and do not make another payment.' : kind === 'success' ? 'Clicking OK will reload this page. Check your email and set your password before signing into the customer panel.' : 'Do not pay again. Keep your payment reference and retry verification or contact NDC support.';
        const actions = $('ndcPaymentActions'); actions.replaceChildren(); if (kind === 'pending') { const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = 'Retry verification'; b.onclick = () => void verify(); actions.append(b); } if (!loading) { const b = document.createElement('button'); b.className = 'btn btn-primary'; b.textContent = kind === 'success' ? 'OK — reload page' : 'Keep reference & reload'; b.onclick = () => { saved.acknowledged = true; persist(); window.location.reload(); }; actions.append(b); } if (!dialog.open) dialog.showModal();
    }
    function banner() {
        $('ndcSignupForm').hidden = true; const box = document.createElement('div'); box.id = 'ndcSignupCompleted'; box.className = 'ndc-signup-completed'; const h = document.createElement('h3'); h.textContent = state === 'complete' ? 'Your payment is complete' : 'Your payment needs confirmation'; const p = document.createElement('p'); p.textContent = `Payment reference: ${saved.proof.razorpay_payment_id}. Check ${saved.details.email} and spam for your setup email. Set your password before signing in.`; box.append(h, p);
        if (state !== 'complete') { const b = document.createElement('button'); b.className = 'btn btn-outline'; b.textContent = 'Check payment confirmation'; b.onclick = () => void verify(); box.append(b); } const login = document.createElement('button'); login.className = 'btn btn-primary'; login.textContent = 'Sign in to customer panel'; login.onclick = () => $('ndcUserButton')?.click(); box.append(login); $('ndcSignupForm').after(box);
    }
    async function verify() {
        if (state === 'verifying' || !saved?.proof) return; state = 'verifying'; update(); show('loading', 'Your payment response has been received. We are checking it securely with the backend.');
        try { const r = await post('/api/public/payments/verify', saved.proof); saved.purchase = r.purchase || saved.purchase; saved.setupEmail = r.setupEmail || { status: 'pending' }; state = saved.state = r.manualReview ? 'review' : 'complete'; saved.acknowledged = false; persist(); update(); status(r.manualReview ? 'Payment received. Contact support for review.' : 'Payment confirmed. Check your setup email.'); show(r.manualReview ? 'review' : 'success', r.manualReview ? 'NDC support must review this payment before activating your account.' : 'The backend has confirmed your payment and recorded your subscription.'); }
        catch (e) { state = saved.state = 'pending'; persist(); update(); status('Payment verification is pending. Do not pay again.'); show('pending', e.message); }
    }
    window.selectPlan = function (name) { if (state !== 'idle') return; const id = String(name).toLowerCase(); if (!plans[id]) return; if(appliedOffer && appliedOffer.planId !== id) offerWidget?.clear('Offer removed because the plan changed.'); selected = id; update(); $('payment').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    window.selectCustomPlan = () => window.open('https://wa.me/919052691719?text=' + encodeURIComponent('Hi, I am interested in a Custom Plan for NDC VAHAN TOOL.'), '_blank', 'noopener');
    async function begin(e) {
        e.preventDefault(); if (state !== 'idle') return; if(offerWidget?.isLoading() || offerWidget?.hasUnapplied()) { status('Apply or remove your offer code before continuing.'); return; } if (!selected) { status('Choose a plan first.'); return; } if (!e.target.reportValidity()) return; if (typeof Razorpay !== 'function') { status('Unable to load Razorpay Checkout.'); return; }
        const details = { referralCode: $('signupReferral').value.trim().toUpperCase(), cloudAddonPlanId: $('signupCloudAddon')?.value || null, cloudAddonQuantity: cloudAddonPlans[$('signupCloudAddon')?.value]?.structure === 'flex' ? Number($('signupCloudAddonQuantity')?.value) : null, name: $('signupName').value.trim(), username: $('accountUsername').value.trim().toLowerCase(), email: $('signupEmail').value.trim(), planId: selected, months: Number($('signupMonths').value), ...(appliedOffer ? {offerCode:appliedOffer.code} : {}), gstin: $('signupGstin').value.trim().toUpperCase(), tradeName: $('signupTradeName').value.trim(), businessName: $('signupBusinessName').value.trim(), businessAddress: $('signupBusinessAddress').value.trim(), stateCode: $('signupStateCode').value.trim(), phone: $('signupBusinessPhone').value.trim() }; orderQuote = null; state = 'creating'; update(); status('Creating your payment order…');
        try {
            const r = await post('/api/public/payments/orders', details), order = r.data || r; if (!order.keyId || !order.orderId || !Number.isFinite(Number(order.amount))) throw Error('Invalid payment order response.'); const p = plans[order.plan?.id || selected]; if (order.gst?.enabled) { checkoutGst = { enabled: true, gstRate: Number(order.gst.rate) || checkoutGst.gstRate }; orderQuote = { amount: Number(order.amount) / 100, listPrice: Number(order.gst.listPrice) / 100, discountAmount: Number(order.gst.discountAmount) / 100, baseAmount: Number(order.gst.taxableAmount) / 100, taxAmount: Number(order.gst.amount) / 100, gstRate: Number(order.gst.rate) || checkoutGst.gstRate }; } state = 'checkout'; update(); status('Complete payment in the secure checkout.');
            const checkout = new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency || 'INR', name: 'Next Dimension Customs', description: order.description || p.name + ' subscription', prefill: { name: details.name, email: details.email }, theme: { color: '#d7bd55' }, handler: proof => { if (state !== 'checkout') return; saved = { proof, details, purchase: { planName: order.plan?.name || p.name, months: order.months || details.months, offer: order.offer || null, maxDevices: order.plan?.maxDevices || p.maxDevices, amount: Number(order.amount) / 100, currency: order.currency || 'INR' }, state: 'pending', acknowledged: false }; persist(); state = 'pending'; void verify(); }, modal: { ondismiss: () => { if (state !== 'checkout') return; state = 'idle'; orderQuote = null; update(); status('Checkout closed. If money was deducted, check your email before retrying.'); } } });
            checkout.on('payment.failed', error => { if (state === 'checkout') status((error.error?.description || 'Payment failed.') + ' You can retry inside checkout or close it.'); }); checkout.open();
        } catch (error) { state = 'idle'; orderQuote = null; update(); status(error.message); }
    }
    // Presentation and draft state only. Payment orders and offer validation remain server-owned.
    const DRAFT_KEY = 'ndcSignupCartV1', draftFields = ['signupName', 'accountUsername', 'signupEmail', 'signupReferral', 'signupGstin', 'signupTradeName', 'signupBusinessName', 'signupBusinessAddress', 'signupStateCode', 'signupBusinessPhone'];
    let checkoutUIReady = false, monthTiles = null, offerCodeToRestore = '';
    function syncCheckoutUI() {
        if (!checkoutUIReady) return;
        const select = $('signupMonths');
        monthTiles.querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.month === select.value));
            button.disabled = select.disabled || state !== 'idle';
        });
        try {
            if (saved?.proof || state === 'complete' || state === 'review') { localStorage.removeItem(DRAFT_KEY); return; }
            // Never retain payment proofs, credentials, or validated offer prices in a cart.
            const fields = Object.fromEntries(draftFields.map(id => [id, $(id).value]));
            if (!selected && !Object.values(fields).some(Boolean)) return;
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 1, at: Date.now(), plan: selected, months: select.value, fields, offerCode: String(appliedOffer?.code || $('ndcSignupOffer')?.querySelector('input')?.value || '').trim().toUpperCase().slice(0, 32) }));
        } catch { /* Checkout remains usable when storage is unavailable. */ }
    }
    function mountCheckoutUI() {
        const select = $('signupMonths');
        monthTiles = document.createElement('div'); monthTiles.className = 'ndc-month-tiles';
        monthTiles.setAttribute('role', 'group'); monthTiles.setAttribute('aria-label', 'Subscription duration in months');
        for (const option of select.options) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'ndc-month-tile'; button.dataset.month = option.value;
            const count = document.createElement('strong'); count.textContent = option.value;
            const caption = document.createElement('span'); caption.textContent = Number(option.value) === 1 ? 'month' : 'months';
            button.append(count, caption);
            button.onclick = () => { if (state !== 'idle' || select.disabled) return; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); };
            monthTiles.append(button);
        }
        select.hidden = true; select.after(monthTiles);
        const label = document.querySelector('label[for="signupMonths"]');
        if (label) { label.id = 'ndcDurationLabel'; monthTiles.setAttribute('aria-labelledby', label.id); label.removeAttribute('for'); }
        let restored = false;
        try {
            const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
            if (saved?.proof) localStorage.removeItem(DRAFT_KEY);
            else if (draft?.version === 1 && Number.isFinite(draft.at) && Date.now() - draft.at >= 0 && Date.now() - draft.at < 30 * 86400000) {
                for (const id of draftFields) if (typeof draft.fields?.[id] === 'string' && !$(id).value) { $(id).value = draft.fields[id].slice(0, $(id).maxLength > 0 ? $(id).maxLength : 254); restored = true; }
                if (typeof draft.offerCode === 'string') offerCodeToRestore = draft.offerCode.trim().toUpperCase().slice(0, 32);
                if (plans[draft.plan]) { selected = draft.plan; restored = true; }
                if ([...select.options].some(o => o.value === String(draft.months))) select.value = String(draft.months);
            } else if (draft) localStorage.removeItem(DRAFT_KEY);
        } catch { }
        checkoutUIReady = true;
        $('ndcSignupForm').addEventListener('input', syncCheckoutUI);
        if (restored) {
            const toast = document.createElement('div'); toast.className = 'ndc-cart-toast'; toast.setAttribute('role', 'status');
            const text = document.createElement('span'); text.textContent = 'Welcome back. Your checkout draft has been restored.';
            const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification'); close.textContent = '\u00d7'; close.onclick = () => toast.remove();
            toast.append(text, close); document.body.append(toast); setTimeout(() => toast.remove(), 6500);
        }
    }
    document.addEventListener('DOMContentLoaded', async () => {
        $('paymentProceed').disabled = true;
        const gstinField = $("signupGstin"), gstinStatus = $("signupGstinStatus");
        const gstinSearchButton = $("signupGstinSearch"), gstinClearButton = $("signupGstinClear");
        const fetchedGstFields = ["signupTradeName", "signupBusinessName", "signupBusinessAddress", "signupStateCode"].map(id => $(id));
        let gstinLookupPending = false, fetchedGstin = "";
        function clearFetchedGstDetails(showMessage = true) {
            fetchedGstFields.forEach(field => {
                field.value = "";
                field.readOnly = false;
                field.removeAttribute("aria-readonly");
            });
            fetchedGstin = "";
            gstinClearButton.hidden = true;
            if (showMessage) gstinStatus.textContent = "Fetched details cleared. You can enter GST billing details manually or search again.";
        }
        async function lookupSignupGstin() {
            const gstin = gstinField.value.trim().toUpperCase();
            gstinField.value = gstin;
            if (!gstin) { gstinStatus.textContent = "Enter a GSTIN before searching."; gstinField.focus(); return; }
            if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
                gstinStatus.textContent = "Enter a valid 15-character GSTIN before searching.";
                return;
            }
            if (gstinLookupPending) return;
            gstinLookupPending = true;
            gstinSearchButton.disabled = true;
            gstinStatus.textContent = "Searching NDC's GSTIN directory, then the configured lookup provider if needed…";
            try {
                const result = await post("/api/public/gstin/lookup", { gstin });
                const data = result.data || {}, address = String(data.address || "").trim();
                if (data.gstin && data.gstin.toUpperCase() !== gstin) throw Error("The GST lookup returned a different GSTIN.");
                if (!data.legalName || !address || data.stateCode !== gstin.slice(0, 2)) {
                    throw Error("The lookup returned incomplete business details. You can enter them manually.");
                }
                $("signupBusinessName").value = data.legalName;
                $("signupTradeName").value = data.tradeName || "";
                // Use the registered trade name as the account full name, but keep it editable.
                $("signupName").value = data.tradeName || data.legalName;
                $("signupBusinessAddress").value = address;
                $("signupStateCode").value = data.stateCode;
                fetchedGstFields.forEach(field => {
                    field.readOnly = true;
                    field.setAttribute("aria-readonly", "true");
                });
                fetchedGstin = gstin;
                gstinClearButton.hidden = false;
                gstinStatus.textContent = "GSTIN successfully verified.";
            } catch (error) {
                gstinStatus.textContent = error.message || "Could not look up this GSTIN. You can enter the GST billing details manually.";
            } finally {
                gstinLookupPending = false;
                gstinSearchButton.disabled = false;
            }
        }
        gstinSearchButton?.addEventListener("click", () => { void lookupSignupGstin(); });
        gstinClearButton?.addEventListener("click", () => clearFetchedGstDetails());
        gstinField?.addEventListener("input", () => {
            const value = gstinField.value.trim().toUpperCase();
            if (fetchedGstin && value !== fetchedGstin) clearFetchedGstDetails(false);
            gstinField.value = value;
        });
        
        try {
            const gstResponse = await fetch(API + '/api/public/gst-checkout-settings', { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
            if (gstResponse.ok) { const gstData = await gstResponse.json(); checkoutGst = { enabled: gstData.enabled === true, gstRate: Number(gstData.gstRate) || 18 }; }
        } catch { /* Server validates the GST setting at order creation. */ }
        try {
            const cloudResponse = await fetch(API + '/api/public/cloud-addon-plans', { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
            if (cloudResponse.ok) {
                const cloudData = await cloudResponse.json();
                for (const plan of cloudData.plans || []) cloudAddonPlans[plan.id] = plan;
            }
            const cloudSelect = $('signupCloudAddon');
            for (const plan of Object.values(cloudAddonPlans)) {
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = plan.name + ' · ' + (plan.structure === 'flex' ? money(plan.perCustomerPrice) + '/customer · up to ' : money(plan.monthlyPrice) + '/month · ') + Number(plan.maxCustomersPerMonth).toLocaleString('en-IN') + ' records';
                cloudSelect.append(option);
            }
            renderCloudChoices();
            cloudSelect?.addEventListener('change', () => { orderQuote = null; update(); });
            $('signupCloudAddonQuantity')?.addEventListener('input', () => { orderQuote = null; update(); });
            await NDCPlans.ready;
            const container = document.querySelector('.pricing');
            const custom = container.querySelector('.plan');
            const iconMarkup = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
            custom.classList.add('ndc-custom-plan');
            const customIcon = document.createElement('span'); customIcon.className = 'ndc-plan-icon'; customIcon.innerHTML = iconMarkup; custom.prepend(customIcon);
            custom.querySelector('h4')?.remove();
            custom.querySelector('ul').innerHTML = '<li><strong>Flexible</strong><span>device limits, tailored to you</span></li>';
            custom.querySelector('.plan-label').textContent = 'Custom';
            $('ndcPlanLoading')?.remove();
            for (const p of NDCPlans.visible) {
                plans[p.id] = p;
                const card = document.createElement('article'); card.className = 'plan';
                const icon = document.createElement('span'); icon.className = 'ndc-plan-icon'; icon.innerHTML = iconMarkup;
                const heading = document.createElement('div'); heading.className = 'plan-label'; heading.textContent = p.name;
                const price = document.createElement('div'); price.className = 'price'; price.textContent = new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2,minimumFractionDigits:0}).format(p.monthlyPrice);
                const per = document.createElement('div'); per.className = 'per'; per.textContent = `per ${p.durationDays} days`;
                const ul = document.createElement('ul');
                for (const text of [`${p.maxDevices} device login${p.maxDevices === 1 ? "" : "s"}`]) {
                    const li = document.createElement('li'); const count = document.createElement('strong'); count.textContent = p.maxDevices; const caption = document.createElement('span'); caption.textContent = p.maxDevices === 1 ? 'device login' : 'device logins'; li.append(count,caption); ul.append(li);
                }
                const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline'; button.textContent = 'Choose ' + p.name; button.onclick = () => window.selectPlan(p.id);
                card.append(icon,heading,price,per,document.createElement('hr'),ul,button); container.insertBefore(card,custom);
            }
            if (!NDCPlans.visible.length) status('No subscription plans are currently available.');
        } catch (error) { $('ndcPlanLoading').textContent = 'Plans are unavailable. Refresh to retry.'; status(error.message); return; }
        $('signupMonths').replaceChildren(); for (let i = 1; i <= 12; i++) { const o = document.createElement('option'); o.value = i; o.textContent = `${i} month${i === 1 ? '' : 's'}`; $('signupMonths').append(o); } $('signupMonths').onchange = () => { if(appliedOffer && appliedOffer.months !== Number($('signupMonths').value)) offerWidget?.clear('Offer removed because the duration changed.'); update(); };
        if(window.NDCOfferCode && $('ndcSignupOffer')) offerWidget = NDCOfferCode.mount($('ndcSignupOffer'), {
            request: code => post('/api/public/offers/preview', {code}), isBusy: () => state !== 'idle',
            onApply: offer => { if(!plans[offer.planId]) throw Error('This offer plan is unavailable. Refresh and try again.'); appliedOffer=offer; selected=offer.planId; $('signupMonths').value=offer.months; update(); },
            onClear: () => { appliedOffer=null; update(); }
        }); $('ndcSignupForm').addEventListener('submit', begin); $('ndcSignupLogin').onclick = () => $('ndcUserButton')?.click();
        window.NDCApplySignupOffer = async code => {
            if (state !== 'idle' || !offerWidget) { status('Finish your current checkout before choosing another offer.'); return false; }
            const applied = await offerWidget.applyCode(code);
            if (applied) $('ndcSignupOffer').scrollIntoView({ behavior:'smooth', block:'center' });
            return applied;
        };
        mountCheckoutUI();
        if (!saved?.proof && offerCodeToRestore && offerWidget) {
            await offerWidget.applyCode(offerCodeToRestore);
            offerCodeToRestore = '';
        }
        if (saved?.proof && saved?.details) { state = ['complete', 'review'].includes(saved.state) ? saved.state : 'pending'; update(); if (saved.acknowledged) banner(); else if (state === 'complete' || state === 'review') show(state === 'complete' ? 'success' : 'review', 'Your payment was already received.'); else void verify(); } else update();
    });
})();
