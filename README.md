# Cinego

A full-stack cinema booking app: browse what's on, pick exact seats on a live
auditorium map, pay with Stripe and get a QR-coded PDF ticket by email.

**Live demo:** https://movie-booking-smawjee.vercel.app — payments run in
Stripe test mode (card `4242 4242 4242 4242`, any future date, any CVC).

## Features

- Films and trailers from TMDB, with showtimes across eight cinemas and six
  screen formats (Standard, IMAX, Dolby, 4DX, ScreenX, 3D)
- Seat selection with 10-minute holds, UK age-rating checks and ID
  verification for 18-rated films
- Stripe card payments with saved cards, promo codes, Cinego+ memberships,
  member and student discounts and free member tickets
- Accounts with email/password or Google sign-in (Supabase Auth), ticket
  history and account deletion
- PDF tickets with signed QR codes, emailed from Cinego over SMTP
- Admin dashboard: revenue and ticket sales, bookings search with ticket
  resend, and a door check that validates ticket QR codes
- Cinebot, an OpenAI assistant grounded in the real programme

## Architecture

```
React + TanStack Router/Query (Vite)  ──►  Express API (Vercel function)
                                              ├─ Supabase Postgres + Auth
                                              ├─ Stripe (payments, webhooks)
                                              ├─ TMDB (films, trailers)
                                              ├─ OpenAI (assistant)
                                              └─ SMTP (ticket email)
```

The browser never talks to the database with elevated rights: every write
goes through the Express API, which uses the Supabase service role. Row-level
security is enabled on every table, and booking functions are callable by the
service role only.

### Design decisions worth a look

- **No double-booking.** Seat holds go through the `hold_seats` SQL function,
  backed by a unique index on active holds per seat
  (`one_active_seat_hold`), so two people racing for the same seat can't both
  win, even across serverless instances. Holds expire after 10 minutes.
- **The server decides the price.** Totals are recomputed from seats,
  memberships and promo codes on the server, and again in SQL at confirm
  time. Nothing the browser sends about money is trusted.
- **Verify-on-return payments.** A booking is confirmed only after the API
  retrieves the PaymentIntent from Stripe and checks it succeeded and matches
  the reservation. The Stripe webhook confirms the same payment
  idempotently, so a closed tab never loses a paid booking.
- **Graceful fallbacks.** Without credentials the app still runs: an
  in-memory store replaces Supabase, built-in films replace TMDB, the
  assistant answers in guided mode and emails render as previews.
- **Privacy by design.** Only the card brand and last four digits are stored.
  Deleting an account removes personal data but keeps bookings as anonymous
  payment records.

## Run locally

```bash
cp .env.example .env    # every key is optional
npm install
npm run build
npm start               # http://localhost:5000
```

For frontend hot reload, also run `npm run dev` and open the Vite address.

## Connect services

1. **Supabase:** create a project and run every file in `supabase/migrations`
   in order. Put the URL, anon key and service-role key in `.env`; never
   expose the service-role key in a `VITE_*` variable.
2. **Supabase Auth:** under Authentication → URL Configuration, set the Site
   URL to your deployed site (or `http://localhost:5000` locally) and add
   `<site>/auth/callback` to the Redirect URLs.
3. **Google sign-in:** create an OAuth client (Web application) in Google
   Cloud with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`,
   then enable the Google provider in Supabase with its client ID and secret.
   Publish the app on the OAuth consent screen so any Google account can sign
   in.
4. **Stripe:** add test-mode keys, and point a webhook at
   `/api/stripe/webhook` for `payment_intent.succeeded`.
5. **TMDB / OpenAI:** add the API keys for live films and the AI assistant.
6. **Email:** create a dedicated Gmail account for the app (e.g. a
   "Cinego Tickets" mailbox), turn on 2-Step Verification, create an
   [app password](https://support.google.com/accounts/answer/185833) and set
   `SMTP_USER` and `SMTP_PASS`. Gmail only sends as the signed-in mailbox, so
   tickets come from that address with the display name `TICKET_FROM_NAME`
   (default "Cinego Tickets"). Without SMTP, tickets render as previews and
   are never reported as sent. Right after booking a ticket can be emailed
   to any address; later, only the signed-in owner can send it elsewhere.
7. **Admins:** set `app_metadata.role` to `"admin"` on a Supabase user (only
   the service role can), or list emails in `ADMIN_EMAILS`. Admins get an
   Admin link in the header that opens `/admin`.

Restart the server after changing `.env`. `GET /api/health` shows which
integrations are live.

## Quality and operations

```bash
npm test                # Vitest: pricing, showtimes, tickets, booking API, Stripe webhook
npm run check           # TypeScript, production build, syntax checks
npm audit --omit=dev
```

- GitHub Actions runs the tests, type check, build and dependency audit on
  every push and pull request.
- A daily Vercel cron calls `/api/keepalive` so the free Supabase project is
  never paused for inactivity, and a daily GitHub Actions job checks the same
  endpoint on the live site and fails loudly if it's down.
- API routes are rate-limited, inputs are validated with Zod, and errors are
  returned as JSON without internal details.
