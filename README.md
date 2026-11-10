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
3. Add the site URL and `https://<your-preview>/auth/callback` to the Auth redirect allow list. The email template should include `{{ .Token }}` so the 6-digit code works, and the magic link should land on `/auth/callback`.
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

`supabase/migrations` creates the tables, the private `application-documents` bucket, RLS, and the residential template. `supabase/seed.sql` adds fictional `example.com` people and one fake file. The local password for every seed account is `PermitGU-local-demo-1`. It is in git on purpose. **Do not run the seed on a public project.**

5. Env vars, in `.env.local` and on the Vercel preview (not production unless you mean to):

| Name | Required |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Tracker |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tracker. Publishable key is fine. |
| `SUPABASE_SERVICE_ROLE_KEY` | Only to create a staff user from the admin page. Never expose it to the browser. |
| `OPENROUTER_API_KEY` | `/api/ask`. Without it the route returns 503 `not_configured`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional shared rate limit for `/api/ask`. |

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

`npm test` runs the workflow state-machine tests and the RLS tests. The RLS tests use PGlite plus the migration. They do not need Docker or a hosted project.

## What the preview still needs

Without the two `NEXT_PUBLIC_SUPABASE_*` vars, `/`, the guides, and `/api/ask` work, and `/apply` explains the template but will not save. With those vars, citizen OTP and staff TOTP work after the Auth redirect URL and email template are set. Uploads need the migration, because it creates the private bucket. Staff invites from the admin page need the service role key. Ask needs `OPENROUTER_API_KEY` on that environment.
