# Garden Ledger

Hours, vehicle, receipts, invoices and tax set-aside for a self-employed gardener in Australia.

## Run it on this computer

Needs Node 22 or newer.

```
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). Then go to **Settings > Import a backup or setup file** and choose `private/import.json` to load your details, client and existing invoices.

Without Supabase, records live only in that one browser, at that one address. Clearing site data deletes them, so download backups from Settings.

## Put it online

Nothing is published until you do these steps.

1. **Supabase:** create a free project at supabase.com. In **SQL Editor**, run all of `supabase/schema.sql` once.
2. In **Authentication**, add your user (email and a strong password), then **turn off new sign-ups**.
3. From the project's API settings, copy the project URL and the **publishable** (or anon) key. Never use the secret or service role key here.
4. **Try it locally:** copy `.env.example` to `.env`, fill in both values and run `npm run dev`. Sign in and import `private/import.json`. If you have already logged records in the browser-only mode, download a backup there first and import that instead.
5. **GitHub:** create a repository and push this folder to its `main` branch. Before pushing, run `git status --ignored` and check that `private/` and `Invoices/` are listed as ignored.
6. In the repository, **Settings > Secrets and variables > Actions > Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`.
7. **Settings > Pages > Source: GitHub Actions**. Then run the *Deploy to GitHub Pages* workflow from the Actions tab.

Free GitHub plans need a public repository for Pages. Your data is not in it: it sits in Supabase, where each row is restricted to your login. `private/`, `Invoices/` and `.env` are git-ignored. Don't upload them by dragging files into GitHub's website, which ignores `.gitignore`.

Free Supabase projects can pause when unused and have limited backups, so keep downloading backups. The ATO generally requires records for five years.

## Give a contractor access

1. Run `supabase/contractor-access.sql` once in Supabase's SQL Editor, after `schema.sql`.
2. In the app, open **Contractor**, enter their email, choose their business and select **Give access**.
3. In Supabase, **Authentication > Users > Add user**: same email, a password, Auto Confirm on. Keep sign-ups off.
4. Send them the site link and their login privately. They see a read-only page of days, times, hours, sites and amounts for that business only.

Removing access in the app takes effect at once. Also delete their user in Supabase.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | Unit, PDF, storage and database-rule tests |
| `npm run preview`, then `node tests/e2e.mjs` | Full walk-through in Chrome |

`npm test` redraws INV-001 and INV-002 and compares every text run, rule and colour with the PDFs in `Invoices/` (only on a computer that has those private files).

## How it works

- Money is stored as whole cents. Hours, earnings, distances and statuses are calculated, never stored.
- Drafts follow your current hours. Marking an invoice as sent locks its contents and hours. **Back to draft** unlocks it.
- Invoices print one "Gardening services" line. The daily breakdown stays in the app.
- Cents per km and logbook are alternatives, chosen per financial year under Vehicle in Settings. Under cents per km, car costs are not deducted again.
- Tax figures are estimates. Rates for 2025-26 and 2026-27 are built in and editable. The Medicare low-income threshold, cents per km and HELP figures for 2026-27 came from secondary sources: check them at ato.gov.au.
