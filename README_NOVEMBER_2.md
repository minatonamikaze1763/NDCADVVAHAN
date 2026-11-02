# NDC customer emails and operations studio

## Deploy

1. Back up the currently deployed files. Keep the existing database and real environment secrets.
2. Deploy the complete `backend` folder, including the new `lifecycle.js`, redesigned `index.html`, `package.json` and lockfile. From that folder run `npm ci --omit=dev`, then start with `npm start` (or keep your existing process manager). Node 20+ is required. Deploying only server.js will not work because it imports lifecycle.js.
3. Set `BREVO_API_KEY`, verified `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `APP_BASE_URL=https://server.nextdimensioncustoms.in`, `CUSTOMER_PANEL_URL=https://vahan.nextdimensioncustoms.in/customer-panel.html`, and `EXPIRY_REMINDERS_ENABLED=true`. Keep all existing MongoDB and Razorpay secrets. `.env.example` lists names and placeholders; do not replace real secrets with those placeholders.
4. Deploy the complete `frontend` folder to the existing website, then hard-refresh. `email-tools.js` is a new required file. Do not put backend files or environment secrets in frontend hosting.
5. Keep `https://vahan.nextdimensioncustoms.in` and the server origin in `ALLOWED_ORIGINS`. Retain any existing permitted extension origins your deployment uses.
6. In the existing signed Razorpay webhook configuration, keep `payment.captured` and `order.paid`. Add `refund.processed` for refund email notices. The webhook URL remains `/api/webhooks/razorpay`. No live webhook settings were changed by this update.
7. Open `/panel` on the server and sign in using your existing superuser account. The backend creates new notification/reset collections and indexes at startup. Existing MongoDB replica-set transaction support remains required, as in the original payment flow.

Do not delete the database, recreate customer accounts, or ask a paid customer to pay again to recover an email.

## What is included

### Customer account

- Registered email is returned by the dashboard and shown in the profile and email settings. It remains visible to the owning account and authenticated admins; public endpoints do not expose it.
- Profile, Payments, and Security include email controls. The latest receipt can be requested only after checking “I checked inbox and spam and did not receive this email.” The account's own payment is selected on the server; browser-supplied customer IDs are ignored.
- Setup resend is shown only for an account still awaiting password setup. These customers normally cannot sign in yet, so the public signup section also includes a separate, confirmed setup-email recovery form.
- Existing accounts use a password-reset link, not another first-time setup link. “Forgot your password?” is in the login dialog; an email reset-link button is also inside account settings. Use the original extension username in the forgot-password form, without appending the panel `_admin` suffix.
- Reset tokens are random, hashed in MongoDB, expire after 30 minutes, and can be used once. Successful reset revokes both panel and extension sessions and older reset/setup links. It does not approve a blocked account. No plaintext passwords are emailed.
- Recent email activity distinguishes pending, sending, accepted, failed, and resolved attempts. “Accepted” means provider acceptance; it is not proof of inbox delivery. Use Brevo delivery logs for bounces, spam rejection and final delivery.

### Superuser operations studio

- Complete graphite-and-gold theme update across the existing console. Existing session controls, account controls, audit logs, diagnostics and connection settings remain available. The old role-change button was removed because the original PATCH API did not support it; role permissions were not expanded.
- Business metrics show customer counts, active access, expiries within seven days, pending setup and email failures. Recorded paid totals are gross values grouped by currency, before refunds and provider fees.
- User rows show registered email, plan and monthly price. Account details show paid expiry, panel expiry, subscription start, last payment, device count, setup status and stored features. Registered emails can be corrected by an authenticated admin with format/uniqueness validation.
- Account search can query all accounts. User pages contain up to 500 records; payment/order/email pages contain 50 records. Dropdowns use the currently loaded customer page; search/load the relevant customer page first if needed. Existing bulk account actions still affect the visible loaded selection only.
- Payments & orders lists successful/manual payment records separately from checkout orders, including references, plan, amount, duration and paid period. Records can be filtered by customer/status and the current page exported.
- Offline payment recording is available with a registered customer, INR amount, method, reference and optional paid-period dates. It records a payment and queues a receipt. As with the original recording API, it does not extend `expiresAt`; account-expiry changes are separate and explicit.
- Email studio sends custom text emails to a selected customer's registered address, with a safe text preview. It can resend setup links and the latest receipt, send a manual renewal reminder, and send a cancellation notice. Subject/body lengths and subject header characters are validated server-side; content is escaped before HTML formatting.
- All new administrative endpoints require the existing admin session and admin role. Customer sessions cannot use them. Customer email history is scoped to its account. Passwords, setup URLs, reset tokens and API keys are not saved in email activity records.
- Failed queued emails can be retried. Failed setup/password-reset attempts use their own link-issuing flow rather than replaying a stale token. Manual administrative sends and receipt requests are logged in the existing audit system.

### Lifecycle email coverage

| Trigger | Email / behavior |
|---|---|
| Successful signup payment | Existing rich setup email with entered username, panel username, plan, enabled features and purchased period, plus payment receipt |
| Successful additional-month purchase | Receipt with amount, plan, months added, payment reference, period start and new paid expiry |
| Successful offline payment record | Receipt using the recorded payment details |
| Password setup completed | Account-ready welcome notification |
| Forgot password | One-time reset link to the matching registered account |
| Password changed/reset | Security notification; both session types revoked |
| Admin approval | Approval notice on a state transition |
| Admin disable/ban/unapprove | Access-change notification on a state transition |
| Admin removes disable/ban | Restriction-removal notification |
| Within seven days before paid expiry | Persistent scheduled renewal reminder, one successful send per expiry, checked hourly; manual sends remain separate |
| Paid access expires | Expiry notification, reconciled for recent expiries within the last seven days |
| Signed `refund.processed` webhook | Refund notice with reference and amount; does not automatically revoke access or issue another refund |
| Support confirms cancellation | Admin sends an explicit cancellation notice; this email alone does not change access, refund a payment or cancel a payment mandate |

## Queue and recovery

Receipt jobs are written in the same MongoDB transaction as payment activation. Duplicate checkout callbacks or webhooks do not add paid time or queue the original receipt twice. This preserves the original 30-day paid month and independent five-day panel-only renewal window.

The email worker checks every minute, uses database leases, and retries queued failures with backoff up to eight attempts. A process restart does not lose queued jobs. A crash after the email provider accepts a request but before MongoDB stores acceptance can still produce a duplicate email on retry; delivery is at-least-once, not exactly-once.

On startup, and during worker scans, successful payment records from the last 24 hours that lack a receipt marker are reconciled into the queue. This includes recent add-on purchases made before this update. Older receipts can be sent from the admin Email studio. Setup-email failures also retry, with a five-minute backoff and a maximum of eight automatic attempts. Manual setup resend resets that attempt budget, respects an in-flight lock, and has a five-minute request cooldown. Public recovery responses intentionally do not confirm whether an account exists.

Existing setup-email lookup fix is retained: historical payment records lacking `purpose` are located through the exact paid signup order and owning account. New payments persist `purpose`.

Existing failed-payment/reload recovery is retained: a matching pending unpaid signup order is reopened; an already-paid order is not charged again. Changing username/email/plan/duration while an unexpired matching order exists remains a conflict. Simultaneous first-time order creation from multiple tabs is not serialized by this update.

## ₹1 live checks

Keep your existing Razorpay LIVE keys and set `NDC_TEST_EMAILS` to the authorized testing email(s). In the website tab console:

```js
sessionStorage.setItem('ndcTestPlan', '1');
location.reload();
```

The test-plan switch is tab-local; run it in another tab if needed. Existing test plan safeguards and the corrected `test` ID are retained. One month charges a real ₹1 with live keys. The switch does not authorize an unlisted email on the server.

## Validation completed

- Ten Node backend tests cover receipt deduplication, retry persistence, admin access restrictions, customer ownership/confirmation, setup resend locks, reset expiry/replay/session revocation, composer validation, actual renewal activation and historical setup-payment lookup.
- DOM interaction checks cover superuser login, user email/details, summary data, safe composer preview/send request, billing records and logout data clearing; customer email display, checkbox gating, receipt resend request, email activity, reset-link request and plan/month totals.
- JavaScript syntax checks and HTML checks for duplicate IDs/nested forms passed. `frontend/auth.js`, `verification.js`, `signup.js` and `plan-catalog.js` are byte-for-byte unchanged from your new upload.
- These checks use mocked MongoDB/provider responses. They do not replace an end-to-end check against your actual MongoDB, Brevo sender, Razorpay LIVE account and deployed origins.
- A Chromium download was attempted but the environment returned truncated archives. DOM behavior was tested; rendered desktop/mobile appearance has not been visually verified in a browser.

To rerun backend tests: `npm ci` then `npm test` in `backend`. To rerun DOM checks: `npm run test:ui` after installing development dependencies.

## Final deployment check

Use one allowed testing account to check signup, setup-email recovery, password creation, login, one additional-month payment, its receipt and updated expiry, customer resend, admin resend/reminder/custom email, and password reset. Confirm Brevo provider acceptance/delivery and MongoDB dates. Use an existing account for approval/deactivation notifications without asking customers to pay again.

## Razorpay Autopay research

This package preserves the existing one-time Orders checkout. It does not silently enroll customers in recurring charges. Razorpay Autopay is a separate Subscriptions/mandate integration and is not activated in this email update.

The official APIs require a gateway plan, a subscription and explicit customer authorization. Checkout signature verification uses the payment ID and the subscription ID stored on the server. Recurring captured charges must be connected to the owning account with idempotent activation; cancellation must call the actual gateway cancellation API. A daily interval of 30 can preserve the current 30-day billing period, while a calendar-month plan has different boundaries. Gateway configuration and supported mandate methods must be verified for your live account before offering it.

Official references: [Create plan](https://razorpay.com/docs/api/payments/subscriptions/create-plan), [Create subscription](https://razorpay.com/docs/api/payments/subscriptions/create-subscription), [Integration and signature verification](https://razorpay.com/docs/payments/subscriptions/integration-guide), [Cancel subscription](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription).
