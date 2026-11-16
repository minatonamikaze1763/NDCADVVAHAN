(() => {
    'use strict';

    function mount() {
        const checkout = document.getElementById('payment');
        if (!checkout || document.getElementById('ndcCheckoutErrorToast')) return;

        const style = document.createElement('style');
        style.textContent = `
          .ndc-checkout-error-toast {
            position:fixed;right:24px;bottom:24px;z-index:10000;
            box-sizing:border-box;width:min(420px,calc(100vw - 32px));
            display:flex;align-items:flex-start;gap:14px;
            padding:18px 20px;border:1px solid #bd6658;border-radius:14px;
            background:#201411;color:#fff1ed;
            box-shadow:0 16px 48px #0008;
            font:400 14px/1.65 var(--portfolio-ui,"Segoe UI",sans-serif);
          }
          .ndc-checkout-error-toast[hidden] {display:none!important}
          .ndc-checkout-error-toast strong {
            display:block;font-weight:600;color:#ffc4b9;margin-bottom:3px;
          }
          .ndc-checkout-error-toast button {
            flex:none;margin-left:auto;border:0;background:none;
            color:#ffc4b9;font:400 24px/1 sans-serif;
            cursor:pointer;padding:4px;
          }
          .ndc-checkout-error-toast button:focus-visible {
            outline:2px solid #d7bd55;outline-offset:3px;
          }
          @media(max-width:480px) {
            .ndc-checkout-error-toast {right:16px;bottom:16px}
          }
        `;
        document.head.append(style);

        const toast = document.createElement('div');
        toast.id = 'ndcCheckoutErrorToast';
        toast.className = 'ndc-checkout-error-toast';
        toast.hidden = true;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-atomic', 'true');

        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = 'Please check your checkout';
        const message = document.createElement('span');
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '\u00d7';
        close.setAttribute('aria-label', 'Dismiss error');
        content.append(title, message);
        toast.append(content, close);
        document.body.append(toast);

        let timer, lastMessage = '', lastTime = 0;
        function show(text) {
            text = String(text || '').trim();
            if (!text) return;
            const now = Date.now();
            if (text === lastMessage && now - lastTime < 800) return;
            lastMessage = text;
            lastTime = now;
            clearTimeout(timer);
            message.textContent = text;
            toast.hidden = false;
            timer = setTimeout(() => { toast.hidden = true; }, 9000);
        }
        close.onclick = () => {
            clearTimeout(timer);
            toast.hidden = true;
        };

        function fieldError(field) {
            const label = field.labels?.[0]?.textContent
                ?.replace(/\s+/g, ' ').trim();
            const name = field.id === 'accountUsername' ? 'Username'
                : field.type === 'email' ? 'Email address'
                : label || field.name || 'This field';
            const v = field.validity;

            if (v.valueMissing) {
                return field.type === 'checkbox'
                    ? 'Please tick the confirmation checkbox before continuing.'
                    : `Please enter ${name.toLowerCase()}.`;
            }
            if (v.typeMismatch && field.type === 'email') {
                return 'Enter a valid email address, for example name@example.com.';
            }
            if (v.patternMismatch && field.id === 'accountUsername') {
                return 'Username can contain only letters, numbers, and underscores.';
            }
            if (v.tooShort) {
                return `${name} must contain at least ${field.minLength} characters.`;
            }
            if (v.tooLong) {
                return `${name} must contain no more than ${field.maxLength} characters.`;
            }
            return `${name}: ${field.validationMessage || 'Please check this value.'}`;
        }

        // Native validation still blocks submission and focuses the field.
        // Show only the first invalid field from each validation attempt.
        let invalidBatch = false;
        checkout.addEventListener('invalid', event => {
            if (invalidBatch) return;
            invalidBatch = true;
            show(fieldError(event.target));
            queueMicrotask(() => { invalidBatch = false; });
        }, true);

        // Reuse errors already reported by the existing checkout logic.
        const observed = new WeakSet();
        function watchStatuses() {
            const nodes = checkout.querySelectorAll(
                '#ndcSignupStatus, .ndc-offer-status, [data-email-status]'
            );
            nodes.forEach(node => {
                if (observed.has(node)) return;
                observed.add(node);
                new MutationObserver(() => {
                    const text = node.textContent.trim();
                    if (!text) return;

                    if (node.matches('.ndc-offer-status')) {
                        if (!/^(Checking your offer|Offer applied|Offer removed|Extra devices)/i.test(text)) {
                            show(text);
                        }
                        return;
                    }

                    if (/error|invalid|failed|unable|could not|couldn't|not found|not available|unavailable|expired|already used|already exists|choose a plan first|apply or remove|enter a valid|required|please enter|please check|please confirm|try again|request failed/i.test(text)) {
                        show(text);
                    }
                }).observe(node, {
                    childList:true,
                    characterData:true,
                    subtree:true
                });
            });
        }

        watchStatuses();
        new MutationObserver(watchStatuses).observe(checkout, {
            childList:true,
            subtree:true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();