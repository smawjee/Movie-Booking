# Cinego

Cinego is a premium-dark cinema booking application built with React, TypeScript, Vite, TanStack Router and TanStack Query. Express provides the secure API boundary for TMDB, booking operations, Stripe payments, memberships, the optional OpenAI assistant and ticket delivery.

## Features

- Browse now-playing and upcoming films with trailers, backed by TMDB or a built-in catalogue.
- Pick seats on a live seat map. Seats are held for a short reservation window while you pay.
- Pay by card through Stripe PaymentIntents and the Stripe Payment Element, with promo codes applied server-side.
- Memberships with monthly plans, cancellation, and saved payment methods tied to a Stripe Customer.
- Tickets with a signed QR code, PDF download and email delivery.
- Cinebot, an assistant that answers questions about films and showtimes.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run build
npm start
```

Open `http://localhost:5000`. For frontend hot reload, run `npm run dev` in a second terminal and open the Vite address.

Without external credentials you can still browse: cinema inventory uses deterministic in-memory demo data, the assistant uses grounded guided responses, and ticket email produces a local preview URL. Checkout needs Stripe test keys (step 4 below); without `STRIPE_SECRET_KEY` the payment endpoints return `Payments are not configured`.

## Connect services

1. [Create a Supabase project](https://supabase.com/dashboard/new) and run every file in `supabase/migrations/` in filename order in its SQL editor. Later migrations add booking persistence, Stripe payment columns, memberships and offers, and `profiles.stripe_customer_id`.
2. Copy `.env.example` to `.env` and fill in the Supabase URL, anon key and service-role key. Never expose the service-role key in `VITE_*` variables.
3. In Supabase Auth, enable Email and Google providers. Set the Site URL to `http://localhost:5000` and allow `http://localhost:5000/auth/callback`; see [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
4. In the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys), copy your test-mode keys. Put the secret key (`sk_test_…`) in `STRIPE_SECRET_KEY` and the publishable key (`pk_test_…`) in `VITE_STRIPE_PUBLISHABLE_KEY`. Pay with the test card `4242 4242 4242 4242`, any future expiry and any CVC; see [Stripe test cards](https://docs.stripe.com/testing).
5. Create a [TMDB API key](https://www.themoviedb.org/settings/api) for live movie content. The built-in catalogue remains available without it.
6. Create an [OpenAI API key](https://platform.openai.com/api-keys) to enable AI responses. Cinebot retains its guided mode without it.
7. For Gmail delivery, enable 2-Step Verification and create a [Google app password](https://support.google.com/accounts/answer/185833). Put the Gmail address in `SMTP_USER`, the 16-character app password in `SMTP_PASS`, and restart the server.
8. Add Langfuse keys for production tracing if required. If Gmail is omitted, the ticket API deliberately reports `preview`, never a false `sent` state.

Vite reads its public Supabase values from the root `.env` through `envDir`. Restart both `npm start` and `npm run dev` after changing environment values. Never paste credentials into chat or commit `.env`.

## Payments

Card payments are live through Stripe. The flow is:

1. `POST /api/reservations` holds the seats.
2. `POST /api/reservations/:id/payment-intent` prices the reservation on the server, applies any promo code, and creates a PaymentIntent. The client never sends an amount.
3. The browser confirms the card with the Stripe Payment Element. Card details go straight to Stripe and never touch this server.
4. `POST /api/bookings/confirm` retrieves the PaymentIntent from Stripe and confirms the booking only if its status is `succeeded` and its metadata matches the reservation.

Memberships follow the same pattern through `/api/memberships/payment-intent` and `/api/memberships/checkout`, and attach a Stripe Customer so cards can be saved, reused and removed. Memberships and saved cards need Supabase configured.

Only the card brand, last four digits, PaymentIntent id, amount, status and timestamp are stored. There is no Stripe webhook yet, so a booking is confirmed only when the browser returns to `/api/bookings/confirm` after paying.

`frontend-react/src/components/PaymentForm.tsx` and `frontend-react/src/lib/supabase.ts` include fallback public keys so the Vercel deployment works without `VITE_*` variables. Set your own `VITE_STRIPE_PUBLISHABLE_KEY` locally, since it must belong to the same Stripe account as `STRIPE_SECRET_KEY`.

## Deploy

`vercel.json` builds the frontend into `frontend-dist` and routes `/api/*` to the Express app in `api/index.js`. Set the server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `TMDB_API_KEY` and the optional ones) as Vercel environment variables.

## Quality checks

```powershell
npm test
npm run check
npm audit --omit=dev
```

The API health endpoint is `GET /api/health`. It reports whether the database, assistant and email are running live or in fallback mode, and `integrations.stripe` shows whether a Stripe secret key is set.
