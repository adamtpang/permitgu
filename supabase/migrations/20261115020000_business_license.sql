-- A second tracked permit: a new general business license, led by Revenue and Taxation.
-- Steps follow Form BL-01 and 11 GCA Chapter 70. See lib/license.ts.

-- 1. Fields that only some permits have live in one JSON column.
alter table public.applications add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.applications drop constraint if exists applications_details_shape;
alter table public.applications add constraint applications_details_shape
  check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4000);
grant select (details) on public.applications to authenticated;

-- 2. The license has its own two papers.
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('plans', 'plot_plan', 'bl01', 'good_moral', 'other'));

-- 3. The permit type, its steps, and its papers.
insert into public.application_types (code, name, lead_agency_id, summary)
select 'business_license_new', 'New general business license', id,
  'Unofficial tracker for a new general business license. It follows Form BL-01 through Revenue and Taxation and the agencies that clear it. Renewals, liquor, tobacco, and professional licenses are out of this flow.'
from public.agencies where code = 'drt'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('bl_intake', 'Intake: Form BL-01, questionnaire, and photo ID', 'drt', 'intake', 'always', 10, 'The General Licensing and Registration Branch checks that the location and activity are complete. An incomplete location is rejected.'),
  ('bl_grt', 'Business privilege tax clearance', 'drt', 'clearance', 'always', 20, '11 GCA §70132 requires this clearance before any license is issued or renewed.'),
  ('bl_income_tax', 'Income tax and withholding clearance', 'drt', 'clearance', 'always', 30, '11 GCA §70132 requires this clearance before any license is issued or renewed.'),
  ('bl_collections', 'Collections clearance', 'drt', 'clearance', 'always', 40, '11 GCA §70132 requires this clearance before any license is issued or renewed.'),
  ('bl_dlm_zoning', 'Zoning and ownership clearance', 'dlm', 'clearance', 'default_routed', 50, 'For a new license, Land Management checks that the use fits the zone and that the applicant owns or may use the premises. Assumed for every new license in this flow. Not confirmed as a rule for every business type.'),
  ('bl_dpw', 'Public Works clearance', 'dpw', 'clearance', 'as_indicated', 60, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_gfd', 'Fire Department clearance', 'gfd', 'clearance', 'as_indicated', 70, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_dphss', 'Public Health clearance', 'dphss', 'clearance', 'as_indicated', 80, 'A clearance box on Form BL-01. It applies to a business that needs a sanitary permit, such as food service. It stays off until a reviewer routes it.'),
  ('bl_clb', 'Contractors License Board clearance', 'clb', 'clearance', 'as_indicated', 90, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_gpd', 'Police Department clearance', 'gpd', 'clearance', 'as_indicated', 100, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_gvb', 'Visitors Bureau clearance', 'gvb', 'clearance', 'as_indicated', 110, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_dpr', 'Parks and Recreation clearance', 'dpr', 'clearance', 'as_indicated', 120, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('bl_gdoe', 'Department of Education clearance', 'gdoe', 'clearance', 'as_indicated', 130, 'A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.'),
  ('fee_assessment', 'Fee assessment', 'drt', 'fees', 'always', 200, 'No dollar amount is stored. The only published schedule is dated March 2013. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'drt', 'fees', 'always', 210, 'Revenue and Taxation contacts the applicant for pickup and fees once every clearance is endorsed. PermitGU does not take payment.'),
  ('bl_issue', 'License issued', 'drt', 'issuance', 'always', 220, 'The number shown is a demo number. It is not a Revenue and Taxation license number.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'business_license_new'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, true, v.notes
from (values
  ('bl01', 'Signed Form BL-01', 'Signed by hand and dated. Revenue and Taxation does not accept a digital signature.'),
  ('good_moral', 'Good Moral Character Questionnaire', 'Filed with Form BL-01.')
) as v(code, name, notes)
join public.application_types t on t.code = 'business_license_new'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog
set trackable = true, application_type_code = 'business_license_new'
where code = 'new-business-license-form-bl-01';

-- 4. A license has no plan review, so intake can lead straight to clearances.
create or replace function private.app_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'draft' then p_to in ('submitted', 'withdrawn')
    when 'submitted' then p_to in ('intake', 'denied', 'withdrawn')
    when 'intake' then p_to in ('plan_review', 'clearances_in_progress', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'plan_review' then p_to in ('clearances_in_progress', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'clearances_in_progress' then p_to in ('fees_due', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'awaiting_applicant' then p_to in ('intake', 'plan_review', 'clearances_in_progress', 'fees_due', 'inspections', 'withdrawn')
    when 'fees_due' then p_to in ('issued', 'awaiting_applicant', 'withdrawn', 'expired')
    when 'issued' then p_to in ('inspections', 'expired')
    when 'inspections' then p_to in ('occupancy_issued', 'awaiting_applicant', 'expired')
    else false
  end;
$$;

create or replace function private.has_phase(p_application uuid, p_phase text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.application_steps s
    join public.workflow_steps w on w.id = s.workflow_step_id
    where s.application_id = p_application and w.phase = p_phase
  );
$$;

create or replace function private.maybe_advance(p_application uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if exists (
    select 1 from public.application_steps
    where application_id = p_application and status = 'info_requested'
  ) then
    return;
  end if;
  select status into v_status from public.applications where id = p_application;
  if v_status = 'intake' and private.phase_clear(p_application, 'intake') then
    if private.has_phase(p_application, 'plan_review') then
      perform private.set_app_status(p_application, 'plan_review', 'Plan-review steps on the default template are queued.', 'advance');
      perform private.queue_phase(p_application, 'plan_review', array['always', 'default_routed']);
      v_status := 'plan_review';
    else
      perform private.set_app_status(p_application, 'clearances_in_progress', 'Default clearances are queued. Other agencies stay not started until the lead agency routes them.', 'advance');
      perform private.queue_phase(p_application, 'clearance', array['always', 'default_routed']);
      v_status := 'clearances_in_progress';
    end if;
  end if;
  if v_status = 'plan_review' and private.phase_clear(p_application, 'plan_review') then
    perform private.set_app_status(p_application, 'clearances_in_progress', 'Default clearances are queued. Other agencies stay not started until DPW routes them.', 'advance');
    perform private.queue_phase(p_application, 'clearance', array['always', 'default_routed']);
    v_status := 'clearances_in_progress';
  end if;
  if v_status = 'clearances_in_progress' and private.phase_clear(p_application, 'clearance') then
    perform private.set_app_status(p_application, 'fees_due', 'Staff still enter the fee. No dollar amount is assumed.', 'advance');
    perform private.queue_code(p_application, 'fee_assessment');
    v_status := 'fees_due';
  end if;
  if v_status = 'inspections' and private.phase_clear(p_application, 'inspection') then
    perform private.queue_code(p_application, 'certificate_of_occupancy');
  end if;
  if v_status = 'inspections' and private.step_status_code(p_application, 'certificate_of_occupancy') = 'approved' then
    perform private.set_app_status(p_application, 'occupancy_issued', 'Certificate of occupancy marked approved in this demo.', 'advance');
  end if;
end;
$$;

-- 5. Drafts. The license keeps its own fields in details, written only through these functions.
create or replace function private.license_details(p_details jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'business_name', left(btrim(coalesce(p_details ->> 'business_name', '')), 200),
    'trade_name', left(btrim(coalesce(p_details ->> 'trade_name', '')), 200),
    'entity_type', left(btrim(coalesce(p_details ->> 'entity_type', '')), 40),
    'registration_number', left(btrim(coalesce(p_details ->> 'registration_number', '')), 200),
    'street', left(btrim(coalesce(p_details ->> 'street', '')), 200),
    'village', left(btrim(coalesce(p_details ->> 'village', '')), 200)
  );
$$;

create or replace function private.create_license_draft(
  p_details jsonb, p_lot text, p_block text, p_scope text, p_attestation boolean, p_attestation_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type uuid;
  v_details jsonb := private.license_details(coalesce(p_details, '{}'::jsonb));
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if v_details ->> 'business_name' = '' then raise exception 'not_ready: business name'; end if;
  if v_details ->> 'entity_type' not in ('sole_proprietor', 'corporation', 'llc', 'partnership') then raise exception 'not_ready: kind of business'; end if;
  select id into v_type from public.application_types where code = 'business_license_new';
  if v_type is null then raise exception 'not_found'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  insert into public.applications (applicant_id, application_type_id, status, lot, block, scope, attestation, attestation_name, details)
  values (auth.uid(), v_type, 'draft', left(btrim(coalesce(p_lot, '')), 200), left(btrim(coalesce(p_block, '')), 200),
    left(btrim(coalesce(p_scope, '')), 2000), coalesce(p_attestation, false), nullif(left(btrim(coalesce(p_attestation_name, '')), 200), ''), v_details)
  returning id into v_id;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.ensure_steps(v_id);
  perform private.write_audit(v_id, 'draft_created', 'application', v_id, null, null, jsonb_build_object('status', 'draft'), 'citizen');
  return v_id;
end;
$$;

create or replace function private.save_license_draft(
  p_application uuid, p_details jsonb, p_lot text, p_block text, p_scope text, p_attestation boolean, p_attestation_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.applications;
  v_details jsonb := private.license_details(coalesce(p_details, '{}'::jsonb));
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select a.* into v from public.applications a
  join public.application_types t on t.id = a.application_type_id
  where a.id = p_application and a.applicant_id = auth.uid() and t.code = 'business_license_new';
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'draft' then raise exception 'application_locked'; end if;
  if v_details ->> 'business_name' = '' then raise exception 'not_ready: business name'; end if;
  if v_details ->> 'entity_type' not in ('sole_proprietor', 'corporation', 'llc', 'partnership') then raise exception 'not_ready: kind of business'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications
  set lot = left(btrim(coalesce(p_lot, '')), 200), block = left(btrim(coalesce(p_block, '')), 200),
      scope = left(btrim(coalesce(p_scope, '')), 2000), attestation = coalesce(p_attestation, false),
      attestation_name = nullif(left(btrim(coalesce(p_attestation_name, '')), 200), ''), details = v_details
  where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
end;
$$;

create or replace function private.submit_application(p_application uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.applications;
  v_type text;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select * into v from public.applications where id = p_application and applicant_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'draft' then raise exception 'illegal_application_transition'; end if;
  select code into v_type from public.application_types where id = v.application_type_id;
  if v_type = 'business_license_new' then
    if coalesce(btrim(v.details ->> 'business_name'), '') = ''
      or coalesce(v.details ->> 'entity_type', '') not in ('sole_proprietor', 'corporation', 'llc', 'partnership')
      or coalesce(btrim(v.scope), '') = '' or coalesce(btrim(v.lot), '') = '' or coalesce(btrim(v.block), '') = ''
      or coalesce(btrim(v.details ->> 'street'), '') = '' or coalesce(btrim(v.details ->> 'village'), '') = ''
      or not v.attestation or coalesce(btrim(v.attestation_name), '') = ''
    then
      raise exception 'not_ready';
    end if;
    if v.details ->> 'entity_type' <> 'sole_proprietor' and coalesce(btrim(v.details ->> 'registration_number'), '') = '' then
      raise exception 'not_ready';
    end if;
    if not exists (select 1 from public.documents d where d.application_id = p_application and d.kind = 'bl01')
      or not exists (select 1 from public.documents d where d.application_id = p_application and d.kind = 'good_moral')
    then
      raise exception 'not_ready';
    end if;
  else
    if coalesce(btrim(v.lot), '') = '' or coalesce(btrim(v.tract), '') = '' or coalesce(btrim(v.block), '') = ''
      or coalesce(btrim(v.zoning_district), '') = '' or v.ownership is null or coalesce(btrim(v.scope), '') = ''
      or v.sewage <> 'public_sewer' or coalesce(btrim(v.water_supply), '') = ''
      or coalesce(btrim(v.contractor_license), '') = '' or not v.attestation or coalesce(btrim(v.attestation_name), '') = ''
    then
      raise exception 'not_ready';
    end if;
    if v.ownership = 'authorized_agent' and coalesce(btrim(v.owner_name), '') = '' then raise exception 'not_ready'; end if;
    if not exists (select 1 from public.documents d where d.application_id = p_application and d.kind = 'plans')
      or not exists (select 1 from public.documents d where d.application_id = p_application and d.kind = 'plot_plan')
    then
      raise exception 'not_ready';
    end if;
  end if;
  perform private.ensure_steps(p_application);
  perform private.set_app_status(p_application, 'submitted', 'Application submitted in this unofficial tracker.', 'submit');
  perform private.queue_phase(p_application, 'intake', array['always', 'default_routed']);
end;
$$;

-- 6. Issuing works for any permit: the issuing step is whichever one sits in the
-- issuance phase, and inspections follow only when the permit has them.
create or replace function private.issue_permit(p_application uuid, p_memo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.applications;
  v_number text;
  v_step uuid;
  v_step_status text;
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  if not (private.is_super_admin() or private.is_lead_staff(p_application)) then raise exception 'not_orchestrator'; end if;
  select * into v from public.applications where id = p_application;
  if v.fees_due_cents is null or v.fees_paid_at is null then raise exception 'fees_not_paid'; end if;
  if not private.phase_clear(p_application, 'fees') then raise exception 'fees_not_complete'; end if;
  v_number := 'DEMO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.demo_permit_seq')::text, 4, '0');
  perform private.set_app_status(p_application, 'issued', p_memo, 'issue');
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set permit_number = v_number where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
  select s.id, s.status into v_step, v_step_status
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  where s.application_id = p_application and w.phase = 'issuance'
  order by w.sort_order
  limit 1;
  if v_step_status in ('not_started', 'queued') then
    update public.application_steps set status = 'in_progress', updated_at = now() where id = v_step;
    v_step_status := 'in_progress';
  end if;
  if v_step_status <> 'approved' then
    update public.application_steps set status = 'approved', memo = btrim(p_memo), updated_at = now() where id = v_step;
  end if;
  if private.has_phase(p_application, 'inspection') then
    perform private.set_app_status(p_application, 'inspections', 'Provisional inspections queued. The checklist is not confirmed by DPW.', 'advance');
    perform private.queue_phase(p_application, 'inspection', array['provisional', 'always', 'default_routed']);
  end if;
  perform private.write_audit(p_application, 'permit_number', 'application', p_application,
    'Demo number. Not an official agency number.', null, jsonb_build_object('permit_number', v_number), 'citizen');
  return v_number;
end;
$$;

create or replace function public.create_license_draft(
  p_details jsonb, p_lot text, p_block text, p_scope text, p_attestation boolean, p_attestation_name text
) returns uuid
language sql
set search_path = ''
as $$ select private.create_license_draft(p_details, p_lot, p_block, p_scope, p_attestation, p_attestation_name) $$;

create or replace function public.save_license_draft(
  p_application_id uuid, p_details jsonb, p_lot text, p_block text, p_scope text, p_attestation boolean, p_attestation_name text
) returns void
language sql
set search_path = ''
as $$ select private.save_license_draft(p_application_id, p_details, p_lot, p_block, p_scope, p_attestation, p_attestation_name) $$;

revoke all on function public.create_license_draft(jsonb, text, text, text, boolean, text) from public, anon;
revoke all on function public.save_license_draft(uuid, jsonb, text, text, text, boolean, text) from public, anon;
revoke all on function private.create_license_draft(jsonb, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function private.save_license_draft(uuid, jsonb, text, text, text, boolean, text) from public, anon, authenticated;
revoke all on function private.license_details(jsonb) from public, anon, authenticated;
revoke all on function private.has_phase(uuid, text) from public, anon, authenticated;
grant execute on function public.create_license_draft(jsonb, text, text, text, boolean, text) to authenticated;
grant execute on function public.save_license_draft(uuid, jsonb, text, text, text, boolean, text) to authenticated;
grant execute on function private.create_license_draft(jsonb, text, text, text, boolean, text) to authenticated;
grant execute on function private.save_license_draft(uuid, jsonb, text, text, text, boolean, text) to authenticated;
