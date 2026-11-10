-- Local demo people only. Do not run this against a public Supabase project.
-- Every account uses the password PermitGU-local-demo-1, which is public because it is in git.
-- Emails are example.com. None of these people are real.
-- Staff still have to enroll an authenticator app before the queue opens.

create extension if not exists pgcrypto with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'maria.cruz.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Maria Cruz"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'daniel.reyes.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Daniel Reyes"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'lena.santos.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lena Santos"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'paolo.duenas.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Paolo Duenas"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'aileen.camacho.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Aileen Camacho"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'ben.taitano.demo@example.com', extensions.crypt('PermitGU-local-demo-1', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ben Taitano"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
select id, id, jsonb_build_object('sub', id::text, 'email', email), 'email', id::text, now(), now(), now()
from auth.users
where email like '%@example.com'
on conflict do nothing;

insert into public.memberships (user_id, agency_id, role)
select '22222222-2222-4222-8222-222222222222', id, 'reviewer' from public.agencies where code = 'dpw'
on conflict do nothing;
insert into public.memberships (user_id, agency_id, role)
select '33333333-3333-4333-8333-333333333333', id, 'agency_admin' from public.agencies where code = 'dpw'
on conflict do nothing;
insert into public.memberships (user_id, agency_id, role)
select '44444444-4444-4444-8444-444444444444', id, 'reviewer' from public.agencies where code = 'dlm'
on conflict do nothing;
insert into public.memberships (user_id, agency_id, role)
select '55555555-5555-4555-8555-555555555555', id, 'reviewer' from public.agencies where code = 'gwa'
on conflict do nothing;
insert into public.memberships (user_id, role, agency_id)
values ('66666666-6666-4666-8666-666666666666', 'super_admin', null)
on conflict do nothing;

-- One fictional in-progress file so the tracker is not empty after a local reset.
insert into public.applications (
  id, applicant_id, application_type_id, status, lot, tract, block, zoning_district,
  ownership, scope, sewage, water_supply, contractor_license, attestation, attestation_name, submitted_at
)
select
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  id,
  'clearances_in_progress',
  '12',
  '4',
  '2',
  'R1 example, not a determination',
  'owner',
  'New private one-family dwelling on public sewer. Fictional demo file.',
  'public_sewer',
  'public',
  'CLB-DEMO-100',
  true,
  'Maria Cruz',
  now()
from public.application_types
where code = 'building_permit_residential_one_family'
on conflict (id) do nothing;

select private.ensure_steps('77777777-7777-4777-8777-777777777777');

update public.application_steps s
set status = case w.code
  when 'dpw_intake' then 'approved'
  when 'dpw_architectural' then 'approved'
  when 'dpw_structural' then 'in_progress'
  when 'dlm_zoning' then 'queued'
  when 'gwa_availability' then 'queued'
  else s.status
end
from public.workflow_steps w
where s.workflow_step_id = w.id
  and s.application_id = '77777777-7777-4777-8777-777777777777';

select private.write_audit(
  '77777777-7777-4777-8777-777777777777',
  'seed',
  'application',
  '77777777-7777-4777-8777-777777777777',
  'Fictional demo file. Not a real permit.',
  null,
  jsonb_build_object('status', 'clearances_in_progress'),
  'citizen'
);
