// Creates fictional example.com users. The password comes from SEED_PASSWORD and is not written into the repo.
// Usage: SEED_PASSWORD='at least 8 characters' DATABASE_URL='postgres://...' node tools/seed_demo.mjs
import { spawnSync } from "node:child_process";

const password = process.env.SEED_PASSWORD ?? "";
if (password.length < 8) {
  console.error("Set SEED_PASSWORD to at least 8 characters. Do not commit it.");
  process.exit(1);
}
const database = process.env.DATABASE_URL;
if (!database) {
  console.error("Set DATABASE_URL to the local Postgres connection string. Nothing was written.");
  process.exit(1);
}

const sql = `
create extension if not exists pgcrypto with schema extensions;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  person.id,
  'authenticated',
  'authenticated',
  person.email,
  extensions.crypt(current_setting('permitgu.seed_password'), extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', person.full_name),
  now(), now(), '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'maria.cruz.demo@example.com', 'Maria Cruz'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'daniel.reyes.demo@example.com', 'Daniel Reyes'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'lena.santos.demo@example.com', 'Lena Santos'),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'paolo.duenas.demo@example.com', 'Paolo Duenas'),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'aileen.camacho.demo@example.com', 'Aileen Camacho'),
  ('66666666-6666-4666-8666-666666666666'::uuid, 'ben.taitano.demo@example.com', 'Ben Taitano')
) as person(id, email, full_name)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select id, id, jsonb_build_object('sub', id::text, 'email', email), 'email', id::text, now(), now(), now()
from auth.users
where email like '%@example.com'
on conflict do nothing;
`;

const script = `select set_config('permitgu.seed_password', '${password.replaceAll("'", "''")}', false);\n${sql}`;
const child = spawnSync("psql", [database, "-v", "ON_ERROR_STOP=1"], { input: script, stdio: ["pipe", "inherit", "inherit"] });
if (child.error) {
  console.error("psql is required to load demo users. The password stayed in the environment.");
  process.exit(1);
}
process.exit(child.status ?? 1);
