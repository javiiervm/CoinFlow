# CoinFlow 2.0 — Local development (dev branch)

## Development vs. production

| Environment | Git branch | Execution | Database |
| --- | --- | --- | --- |
| Development | `dev` | Local computer (`npm run dev`) | **CoinFlow 2.0 Dev**, Supabase EU-West |
| Production (future) | `main` | Vercel (after release) | A separate production Supabase project, **not created yet** |

**No Vercel Git connection for `dev`.** Do not connect `main` to a new Vercel project until CoinFlow 2.0 is ready to replace CoinFlow 1.0 there. When ready, merge a verified `dev` commit into `main`, link `main` as production and enable Git deployments.

## Supabase development project

- Name: **CoinFlow 2.0 Dev**
- Region: **eu-west-1 (Ireland)**
- URL: `https://jylvjorhvzmbguxetxxw.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/jylvjorhvzmbguxetxxw
- SQL migrations: `001_init`, `002_legacy_import`, `003_financial_operations`, `004_secure_ledger`, `005_private_operations`, applied in order. Do not re-run them on the same database.

### Enable local email authentication (dashboard)

The connected Supabase management tools cannot modify all Auth URL settings. In the dashboard, open:

**Authentication → URL Configuration**
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`
- Redirect URLs: `http://localhost:3000/auth/callback?next=%2Fauth%2Fupdate-password`

Then open **Authentication → Providers → Email**, enable email sign-up and preferably email confirmation. For production, email delivery should use a verified custom SMTP provider and appropriately restricted URLs.

### Local .env.local

From the `dev` checkout, create `.env.local` (ignored by Git):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://jylvjorhvzmbguxetxxw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_PUBLISHABLE_KEY
```

Get the **publishable** key from Supabase Dashboard → Project Settings → API Keys.
Do **not** use the `service_role` / secret key or the database password. The publishable key is intended for browser use.

## Test your account

```sh
git switch dev
git pull origin dev
npm install
npm run dev
```

Open http://localhost:3000, choose **Settings**, and sign up with a testing email address. Verify it from your inbox if requested. Sign in and confirm that you can create an income transaction and a piggybank, then allocate, withdraw, and spend test money. Open the same local app in a second browser/profile to check session persistence.

For import testing, first use a synthetic CoinFlow 1.0 `data.json` backup (not personal data). Verify counts and balances. Never delete your original 1.0 backup.

## CI / database safety

- Every `dev` push runs TypeScript checks, unit tests, Next.js build and PostgreSQL migration + RLS smoke tests.
- All five migrations are applied to the CI disposable database in order.
- Authenticated clients may insert **manual** transactions, but **cannot** forge operation-linked ledger rows.
- The `apply_financial_operation` public RPC is SECURITY INVOKER, delegates to a restricted internal SECURITY DEFINER implementation that checks auth.uid(), and runs with restricted execute grants; grouped records are created atomically.
- The development Supabase project and local test users will **not** be used for production.

Do not expose the `coinflow_internal` schema in Supabase Data API settings.
