# Offer-code checkout update

Publish index.html, customer-panel.html, signup.js, customer-panel.js,
offer-code.js and offer-code.css together, after deploying the offers-enabled
backend. No frontend package install is needed.

Optional offer codes are available at signup and subscription renewal. Applying
a valid code selects its required plan and months and shows the benefit. Changing
plan or months removes it; every order is revalidated and priced by the backend.
Basic renewals display retained device benefits supplied by the customer API.

6PLUS1: Basic, six 30-day months, ₹995 after a ₹199 discount, two devices,
with the second device retained on future Basic renewals at ₹199/month.
Valid 5 November 2026 through 1 January 2027 inclusive, India Standard Time.
One redemption per account. No existing user records are migrated.

See ndcserver/OFFERS.md for API details, superuser operation and deployment checks.

The landing page now includes a live Offers showcase. Publish offers-showcase.js and offers-showcase.css too, and deploy the backend offers.js update providing GET /api/public/offers. Only active offers within their validity dates are shown. Copy code / Use this offer actions connect to signup. Both the showcase and offer-code controls use the site's existing root color variables.
