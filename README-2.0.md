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

1. Use the existing **CoinFlow 2.0 Dev** Supabase project (EU, separate from future production). See [Development setup](docs/DEVELOPMENT.md).
2. Copy `.env.example` to an untracked `.env.local` and insert the project's **publishable** key and URL.
3. Configure Supabase's local Auth site URL and redirect allowlist in the Dashboard.
4. Install dependencies, run `npm run dev`, and create a **test account**. The four SQL migrations have been applied to the development project; on a new project apply migrations 001–004 in order.

**Never expose service-role or secret keys in client environment variables.**

## Current capabilities

- Responsive dark/light dashboard and mobile navigation
- Email registration, login, reset-email initiation and sign-out (Supabase setup required)
- Isolated user transactions and piggybanks with RLS
- EUR/USD separate views, monthly summaries, cashflow charts, searching
- Creation and removal of transactions and piggybanks, CSV export
- CoinFlow 1.0 `data.json` import with local preview, account-scoped duplicate protection and atomic SQL import
- Atomic transfers between global balances and piggybanks (including external deposits and spending from piggybanks)
- Manual EUR/USD exchange recording with user-entered amounts
- Financial operation audit trail, retry idempotency, insufficient-funds checks and safeguards against deleting one side of a transfer
- Monthly charts exclude transfers and currency exchanges so they are not mistaken for earned income or new spending
- Read-only sample-data experience with explicit demo banner

## Important limitations

This is **development software, not a production-ready accounting system**. New atomic transfers, piggybank spending, manual currency exchanges and legacy imports have been implemented, but **applied to a Supabase development project (with PostgreSQL integration tests; end-to-end authentication still needs manual verification)**. Not all 1.0 behaviors have been ported (notably legacy spend-and-archive, historical transaction editing and automatic exchange rates). The demo data are not persisted. Do not use this build as the sole record for real money until database integration tests and deployment hardening are complete.

For a future public launch, add a password-reset completion view, full end-to-end Supabase client tests and concurrent requests, editing/archiving flows, full legacy balance reconciliation, email delivery/domain setup, privacy policy, backup/restore, monitoring, and production deployment checks.

## Import existing CoinFlow 1.0 data.json

1. In the original app, stop Flask and keep a **backup** of the local `data.json` file. Do not overwrite it. It contains `transactions[]` and `piggybanks[]`.
2. Set up Supabase and apply **all four SQL migrations in order** (including the 2.0 legacy-import migration). Never put a service-role key in the browser.
3. Open CoinFlow 2.0 and sign in or register. Go to **Settings → Import from CoinFlow 1.0** (or **Configuración → Importar desde CoinFlow 1.0**).
4. Select `data.json` (max 5 MB), review transaction/piggybank counts and **EUR/USD global balances**, and compare them with the totals in the original app.
5. Click **Import data** only after confirming the preview. The browser uploads data only after confirmation. The source file on disk is never modified.

The import runs within one PostgreSQL transaction through an authenticated Supabase RPC. If validation fails, no rows are imported. The original, possibly non-UUID source IDs are remapped to new UUIDs with piggybank references preserved. Original record metadata (exchange markers, edits, old labels, timestamps) is retained in `legacy_record` for later migrations. Zero-amount historic transactions are supported.

- **No overwrite:** records already in the account are left untouched, and new records are appended.
- **Idempotency:** importing the exact same file again does nothing.
- **Overlapping backups:** a different backup containing any previously imported source IDs is rejected *entirely*, to avoid duplicating balances. We can implement a controlled reconciliation/update flow later.
- **Unsupported files:** currencies other than EUR/USD, invalid dates, mixed-currency bank records, malformed values and missing active piggybanks are refused rather than guessed or silently dropped.
- **Privacy:** the file is parsed locally for preview; importing uploads the records (including their original metadata) into the user's own Supabase account. Backup files never go to GitHub.

**Important:** the importer retains the original history and legacy savings overflow calculations. New transfers are now atomic, but existing 1.0 transfers and spending histories have not been fully reconciled against a live database. Compare totals with your original app and keep your original JSON backup.

### Migration checks

For Node.js 22 or newer, run `npm test` (or `npm run test:legacy` / `npm run test:finance`) to check data migration and business rules. Run `npm run typecheck` and `npm run build` before publishing. A GitHub Actions workflow on `dev` runs the same checks.

### Financial operations (requires SQL migrations 003 and 004)

- On **Piggybanks**, use **Add funds** (from available balance or from external funds), **Withdraw** (back to global balance), or **Spend** (record a real expense using funds held in the piggybank).
- On **Dashboard / Transactions**, use **Exchange** to move money from EUR to USD or vice versa. You must enter both the source amount and actual received amount; this does *not* fetch an exchange rate automatically.
- Transfers from global balance and currency exchanges refuse to exceed available funds. Withdrawals and spending refuse to exceed the selected piggybank's balance. Expense-tracker piggybanks accept repayments but do not offer withdrawal/spending.
- The backend records linked entries and an audit operation in **one atomic SQL transaction**. Network retries reuse an idempotency key, and already-applied operations cannot accidentally duplicate a transfer. A shared account-level write lock serializes imports and ledger writes.
- Individual deletion/modification of linked entries is disallowed, and piggybanks with history cannot be deleted through the new interface. Full group reversal and spend/archive migration are intentionally deferred to a later phase.
- Monthly income/expense charts exclude new internal transfers and exchanges. Imported 1.0 entries still lack operation grouping, so legacy monthly analytics need further reconciliation.

Run the migrations **once, in order**, before attempting any account operation. Never expose the Supabase service-role key to the browser.


## Deployment model: local development, GitHub main production

- **`dev`**: run locally with `npm run dev`. This branch is **not connected to Vercel** and uses the separate Supabase development project with test accounts.
- **`main`**: will be connected to a Vercel production project **only after** CoinFlow 2.0 is ready. Merge reviewed and tested `dev` changes into `main`; then Vercel deploys on every `main` push.
- **Production data**: create a **separate Supabase production project** later. Never reuse development users, test transactions, or development API settings for production.
- Until the initial release, `main` must keep the existing CoinFlow 1.0 Flask code unchanged. Do not connect the current `main` as a Next.js production project.
- The complete local workflow is in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Never put private credentials or a user's `data.json` in GitHub.
