# CoinFlow 2.0 (development branch)

CoinFlow 2.0 is the new responsive multi-user web application. The original Flask app is intentionally retained in this branch for reference during migration; the **new** application runs from `src/` using Next.js.

## Stack

- Next.js App Router, React, TypeScript, Recharts and Lucide
- Supabase Auth and PostgreSQL with row-level security
- Ready for deployment to Vercel after provisioning external services

## Run locally

Requirements: Node.js >= 20.9, a suitable current npm version.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Without Supabase configuration, the app displays **read-only fictional sample data** and disables all edits.

To enable accounts and persistent data:

1. Create a Supabase project.
2. Run `supabase/migrations/202611070001_init.sql` in its SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
4. In Supabase Auth, enable email registration and configure allowed redirect URLs for `http://localhost:3000/auth/callback` and your eventual production URL.
5. Restart the dev server and create an account.

**Never expose service-role or secret keys in client environment variables.**

## Current capabilities

- Responsive dark/light dashboard and mobile navigation
- Email registration, login, reset-email initiation and sign-out (Supabase setup required)
- Isolated user transactions and piggybanks with RLS
- EUR/USD separate views, monthly summaries, cashflow charts, searching
- Creation and removal of transactions and piggybanks, CSV export
- Read-only sample-data experience with explicit demo banner

## Important limitations

This is an **initial development milestone**, not a production-ready migration of the original Flask app. The old version's advanced piggybank accounting, atomic internal transfers, currency exchanges, importing old `data.json`, transaction editing and recurring rules are **not yet migrated**. The demo data are not persisted. Never use this version to manage real money until the accounting rules, server-side atomic operations, test coverage, and deployment hardening are complete.

For a future public launch, add a password-reset completion view, transactional transfer functions, thorough accounting tests, email delivery/domain setup, privacy policy, backup/restore, monitoring, and deployment checks.
