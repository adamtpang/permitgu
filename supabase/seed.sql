-- Catalog rows are in the migrations. This file only attaches fictional demo
-- roles and one fake file when those people already exist.
-- It does not contain a password. Create the demo users with:
--   SEED_PASSWORD='choose-a-local-password' DATABASE_URL='postgres://...' node tools/seed_demo.mjs
-- Emails are example.com. Do not put real people in this file.

insert into public.memberships (user_id, agency_id, role)
select p.id, a.id, 'reviewer'
from public.profiles p
join public.agencies a on a.code = 'dpw'
where p.email = 'daniel.reyes.demo@example.com'
on conflict do nothing;

insert into public.memberships (user_id, agency_id, role)
select p.id, a.id, 'agency_admin'
from public.profiles p
join public.agencies a on a.code = 'dpw'
where p.email = 'lena.santos.demo@example.com'
on conflict do nothing;

insert into public.memberships (user_id, agency_id, role)
select p.id, a.id, 'reviewer'
from public.profiles p
join public.agencies a on a.code = 'dlm'
where p.email = 'paolo.duenas.demo@example.com'
on conflict do nothing;

insert into public.memberships (user_id, agency_id, role)
select p.id, a.id, 'reviewer'
from public.profiles p
join public.agencies a on a.code = 'gwa'
where p.email = 'aileen.camacho.demo@example.com'
on conflict do nothing;

insert into public.memberships (user_id, role, agency_id)
select p.id, 'super_admin', null
from public.profiles p
where p.email = 'ben.taitano.demo@example.com'
on conflict do nothing;

insert into public.applications (
  id, applicant_id, application_type_id, status, lot, tract, block, zoning_district,
  ownership, scope, sewage, water_supply, contractor_license, attestation, attestation_name, submitted_at
)
select
  '77777777-7777-4777-8777-777777777777',
  p.id,
  t.id,
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
from public.profiles p
join public.application_types t on t.code = 'building_permit_residential_one_family'
where p.email = 'maria.cruz.demo@example.com'
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from public.applications where id = '77777777-7777-4777-8777-777777777777') then
    perform private.ensure_steps('77777777-7777-4777-8777-777777777777');
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
  end if;
end $$;
