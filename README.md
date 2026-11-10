# PermitGU

Unofficial Guam permit guide, plus a tracker for one permit: a private one-family building permit led by the Department of Public Works.

This is not a Government of Guam website. It does not use a government seal. It does not take payment. Fees, when a reviewer enters them, are paid in person at the Treasurer of Guam.

The guides (food truck, typhoon repair, building, and the rest) and `POST /api/ask` are the information layer. They render when Supabase is not configured. The tracker needs a Supabase project.

Live guide: https://permitgu.vercel.app

## Tracker

Citizens sign in with an email code. Staff sign in with a password and an authenticator app (TOTP). Until that second factor succeeds, staff queries are empty and staff actions fail in the database.

A citizen drafts the DPW fields, uploads plans and a plot plan to a private Storage bucket, and submits. The file then moves intake → plan review → clearances → fees due → issued → inspections → occupancy. Each agency step is visible. Reviewers only see steps for their agency. DPW, the lead, can see every submitted residential file and can route the "as indicated" steps.

Anything that is not confirmed from a public source is labeled on the step. See [docs/residential-workflow.md](docs/residential-workflow.md).

## Setup

1. Create a Supabase project. Do not commit its keys.
2. In Authentication → Providers, keep email enabled. TOTP is the staff second factor. On hosted projects it is available in the Auth MFA settings. Local `supabase/config.toml` turns TOTP enroll and verify on.
3. Add the site URL and `https://<your-preview>/auth/callback` to the Auth redirect allow list. The default magic-link email is enough. It does not need `{{ .Token }}` or custom SMTP. `/auth/callback` accepts the link Supabase sends.
4. Apply the database:

```bash
supabase link --project-ref <ref>
supabase db push
```

Or, with Docker, from this repo:

```bash
supabase start
supabase db reset
```

`supabase/migrations` creates the tables, the private `application-documents` bucket (20 MB; PDF, PNG, JPEG, WebP), RLS, the residential workflow, and the agency and permit catalog from `docs/sources`. `supabase/seed.sql` has no password. It only attaches fictional `@example.com` roles when those users already exist.

Demo users, local only:

```bash
SEED_PASSWORD='choose-at-least-8-characters' DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' node tools/seed_demo.mjs
```

Then `supabase db reset` is not required again. The seed file runs on reset and will attach roles if the users are already there. Do not commit `SEED_PASSWORD`. Do not point this at a public database.

5. Env vars, in `.env.local` and on the Vercel preview (not production unless you mean to):

| Name | Required |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Tracker |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tracker. Publishable key is fine. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only to create a staff user from the admin page. Never expose it to the browser. |
| `OPENROUTER_API_KEY` | `/api/ask`. Without it the route returns 503 `not_configured`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional shared rate limit for `/api/ask`. |
| `SEED_PASSWORD` | Local demo users only, via `tools/seed_demo.mjs`. Never commit it. |

`NEXT_PUBLIC_*` values are baked in at build time. After adding them, redeploy the preview. Do not deploy this branch to production from here.

Bootstrap one super admin in the SQL editor after that person has signed up once (the signup trigger creates their profile):

```sql
insert into public.memberships (user_id, role, agency_id)
select id, 'super_admin', null from public.profiles where email = 'you@example.com';
```

Then sign in at `/staff/sign-in`, enroll an authenticator app, and grant other roles from `/admin`.

## Scripts

```bash
npm run dev
npm test
npm run build
python tools/build_kb.py   # after a guide page changes
```

`npm test` runs workflow transitions, catalog parsing, queue and audit filters, MFA route gating, upload checks, and PGlite tests for RLS, storage, assignee access, and the append-only audit log. No Docker or hosted project is required. `npm run build` succeeds with no env vars.

## What the preview still needs

Without the two `NEXT_PUBLIC_SUPABASE_*` vars, `/`, the guides, and `/api/ask` work, and `/apply` explains the template but will not save. With those vars, citizen OTP and staff TOTP work after the Auth redirect URL and email template are set. Uploads need the migration, because it creates the private bucket. Staff invites from the admin page need the service role key. Ask needs `OPENROUTER_API_KEY` on that environment.
