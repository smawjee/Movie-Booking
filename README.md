# Cinego

Cinego is a premium-dark cinema booking application built with React, TypeScript, Vite, TanStack Router and TanStack Query. Express provides the secure API boundary for TMDB, booking operations, the optional OpenAI assistant and ticket delivery.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run build
npm start
```

Open `http://localhost:5000`. For frontend hot reload, run `npm run dev` in a second terminal and open the Vite address.

Without external credentials the application remains usable: cinema inventory uses deterministic in-memory demo data, the assistant uses grounded guided responses, and ticket email produces a local preview URL.

## Connect services

1. [Create a Supabase project](https://supabase.com/dashboard/new) and run `supabase/migrations/20260910_initial_cinego.sql` in its SQL editor.
2. Copy `.env.example` to `.env` and fill in the Supabase URL, anon key and service-role key. Never expose the service-role key in `VITE_*` variables.
3. In Supabase Auth, enable Email and Google providers. Set the Site URL to `http://localhost:5000` and allow `http://localhost:5000/auth/callback`; see [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
4. Create a [TMDB API key](https://www.themoviedb.org/settings/api) for live movie content. The built-in catalogue remains available without it.
5. Create an [OpenAI API key](https://platform.openai.com/api-keys) to enable AI responses. Cinebot retains its guided mode without it.
6. For Gmail delivery, enable 2-Step Verification and create a [Google app password](https://support.google.com/accounts/answer/185833). Put the Gmail address in `SMTP_USER`, the 16-character app password in `SMTP_PASS`, and restart the server.
7. Add Langfuse keys for production tracing if required. If Gmail is omitted, the ticket API deliberately reports `preview`, never a false `sent` state.

Vite reads its public Supabase values from the root `.env` through `envDir`. Restart both `npm start` and `npm run dev` after changing environment values. Never paste credentials into chat or commit `.env`.

Payment remains a simulation. Only the card brand, last four digits, transaction reference, amount, status and timestamp are retained. Full card numbers, CVVs and DOBs are discarded.

## Quality checks

```powershell
npm test
npm run check
npm audit --omit=dev
```

The API health endpoint is `GET /api/health`. It reports whether database, assistant and email integrations are running live or in fallback mode.
