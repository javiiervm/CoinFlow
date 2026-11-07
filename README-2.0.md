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
4. Run `supabase/migrations/202611070002_legacy_import.sql` in the same SQL editor (required for importing older local data).
5. In Supabase Auth, enable email registration and configure allowed redirect URLs for `http://localhost:3000/auth/callback` and your eventual production URL.
6. Restart the dev server and create an account.

**Never expose service-role or secret keys in client environment variables.**

## Current capabilities

- Responsive dark/light dashboard and mobile navigation
- Email registration, login, reset-email initiation and sign-out (Supabase setup required)
- Isolated user transactions and piggybanks with RLS
- EUR/USD separate views, monthly summaries, cashflow charts, searching
- Creation and removal of transactions and piggybanks, CSV export
- CoinFlow 1.0 `data.json` import with local preview, account-scoped duplicate protection and atomic SQL import
- Read-only sample-data experience with explicit demo banner

## Important limitations

This is an **initial development milestone**, not a production-ready migration of the original Flask app. The old version's advanced piggybank accounting, atomic internal transfers, currency exchanges, importing old `data.json`, transaction editing and recurring rules are **not yet migrated**. The demo data are not persisted. Never use this version to manage real money until the accounting rules, server-side atomic operations, test coverage, and deployment hardening are complete.

For a future public launch, add a password-reset completion view, transactional transfer functions, thorough accounting tests, email delivery/domain setup, privacy policy, backup/restore, monitoring, and deployment checks.

## Import existing CoinFlow 1.0 data.json

1. In the original app, stop Flask and keep a **backup** of the local `data.json` file. Do not overwrite it. It contains `transactions[]` and `piggybanks[]`.
2. Set up Supabase and apply **both SQL migrations in order** (including the 2.0 legacy-import migration). Never put a service-role key in the browser.
3. Open CoinFlow 2.0 and sign in or register. Go to **Settings → Import from CoinFlow 1.0** (or **Configuración → Importar desde CoinFlow 1.0**).
4. Select `data.json` (max 5 MB), review transaction/piggybank counts and **EUR/USD global balances**, and compare them with the totals in the original app.
5. Click **Import data** only after confirming the preview. The browser uploads data only after confirmation. The source file on disk is never modified.

The import runs within one PostgreSQL transaction through an authenticated Supabase RPC. If validation fails, no rows are imported. The original, possibly non-UUID source IDs are remapped to new UUIDs with piggybank references preserved. Original record metadata (exchange markers, edits, old labels, timestamps) is retained in `legacy_record` for later migrations. Zero-amount historic transactions are supported.

- **No overwrite:** records already in the account are left untouched, and new records are appended.
- **Idempotency:** importing the exact same file again does nothing.
- **Overlapping backups:** a different backup containing any previously imported source IDs is rejected *entirely*, to avoid duplicating balances. We can implement a controlled reconciliation/update flow later.
- **Unsupported files:** currencies other than EUR/USD, invalid dates, mixed-currency bank records, malformed values and missing active piggybanks are refused rather than guessed or silently dropped.
- **Privacy:** the file is parsed locally for preview; importing uploads the records (including their original metadata) into the user's own Supabase account. Backup files never go to GitHub.

**Important:** the importer migrates supported historical records and the legacy global-balance/savings-overflow formula, but it does **not** finish porting every CoinFlow 1.0 operation (transfers, editing legacy budget/debt rules, etc.). Do not treat this development build as finalized real-money accounting software.

### Migration checks

For Node.js 22 or newer, run `npm run test:legacy` to check parser behavior and the compatibility of EUR/USD balances and savings/budget/debt categories.
