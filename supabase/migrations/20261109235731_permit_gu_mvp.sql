-- Permit GU MVP: residential one-family building permit.
-- Reference rows are inserted at the bottom. Demo people live in supabase/seed.sql only.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.roles (
  code text primary key,
  description text not null
);

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  acronym text not null,
  website text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agency_id uuid references public.agencies (id),
  role text not null references public.roles (code),
  created_at timestamptz not null default now(),
  constraint memberships_agency_shape check (
    (role in ('citizen', 'super_admin') and agency_id is null)
    or (role in ('reviewer', 'agency_admin') and agency_id is not null)
  )
);

create unique index memberships_user_role_agency_uidx
  on public.memberships (user_id, role, coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.application_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  lead_agency_id uuid not null references public.agencies (id),
  summary text not null,
  created_at timestamptz not null default now()
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  application_type_id uuid not null references public.application_types (id) on delete cascade,
  code text not null,
  name text not null,
  agency_id uuid not null references public.agencies (id),
  phase text not null check (phase in ('intake', 'plan_review', 'clearance', 'fees', 'issuance', 'inspection', 'occupancy')),
  routing text not null check (routing in ('always', 'default_routed', 'as_indicated', 'gated', 'provisional')),
  sort_order integer not null,
  uncertainty text,
  unique (application_type_id, code)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id),
  application_type_id uuid not null references public.application_types (id),
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'intake', 'plan_review', 'clearances_in_progress',
    'awaiting_applicant', 'fees_due', 'issued', 'inspections', 'occupancy_issued',
    'denied', 'withdrawn', 'expired'
  )),
  rfi_return_status text,
  lot text,
  tract text,
  block text,
  zoning_district text,
  ownership text check (ownership is null or ownership in ('owner', 'lessee', 'authorized_agent')),
  owner_name text,
  scope text,
  valuation_cents bigint check (valuation_cents is null or valuation_cents >= 0),
  sewage text,
  water_supply text,
  contractor_license text,
  architect_seal text,
  engineer_seal text,
  attestation boolean not null default false,
  attestation_name text,
  fees_due_cents bigint check (fees_due_cents is null or fees_due_cents >= 0),
  fees_paid_at timestamptz,
  fees_paid_by uuid references public.profiles (id),
  permit_number text unique,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_steps (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  workflow_step_id uuid not null references public.workflow_steps (id),
  agency_id uuid not null references public.agencies (id),
  status text not null default 'not_started' check (status in (
    'not_started', 'queued', 'in_progress', 'info_requested', 'approved', 'rejected', 'waived', 'n_a'
  )),
  assignee_id uuid references public.profiles (id),
  memo text,
  internal_note text,
  updated_at timestamptz not null default now(),
  unique (application_id, workflow_step_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  kind text not null check (kind in ('plans', 'plot_plan', 'other')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  scan_status text not null default 'not_scanned' check (scan_status in ('not_scanned')),
  created_at timestamptz not null default now()
);

create table public.info_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  step_id uuid not null references public.application_steps (id),
  author_id uuid not null references public.profiles (id),
  body text not null,
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  visibility text not null check (visibility in ('citizen', 'staff')),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  application_id uuid references public.applications (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  memo text,
  before jsonb,
  after jsonb,
  visibility text not null check (visibility in ('citizen', 'staff')),
  created_at timestamptz not null default now()
);

create sequence public.demo_permit_seq;

create index applications_applicant_idx on public.applications (applicant_id);
create index application_steps_agency_status_idx on public.application_steps (agency_id, status);
create index application_steps_application_idx on public.application_steps (application_id);
create index documents_application_idx on public.documents (application_id);
create index audit_log_application_idx on public.audit_log (application_id, id);

insert into public.roles (code, description) values
  ('citizen', 'Applicant. Email one-time code. Sees their own applications.'),
  ('reviewer', 'Agency staff. Password plus authenticator app. Works that agency queue.'),
  ('agency_admin', 'Agency supervisor. Routes reviewers for one agency.'),
  ('super_admin', 'Platform operator. Break-glass, template routing, and audit export.');

-- Authorization helpers. Security definer so policies can read memberships
-- without recursing through RLS. They do not trust user-editable metadata.

create or replace function private.aal()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function private.is_agency_admin(p_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and role = 'agency_admin' and agency_id = p_agency
  );
$$;

create or replace function private.owns_application(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.applications
    where id = p_application and applicant_id = auth.uid()
  );
$$;

create or replace function private.can_staff_view_application(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.aal() = 'aal2' and (
    private.is_super_admin()
    or exists (
      select 1
      from public.applications a
      join public.application_types t on t.id = a.application_type_id
      join public.memberships m
        on m.agency_id = t.lead_agency_id
       and m.user_id = auth.uid()
       and m.role in ('reviewer', 'agency_admin')
      where a.id = p_application and a.status <> 'draft'
    )
    or exists (
      select 1
      from public.application_steps s
      join public.memberships m
        on m.agency_id = s.agency_id
       and m.user_id = auth.uid()
       and m.role in ('reviewer', 'agency_admin')
      join public.applications a on a.id = s.application_id
      where s.application_id = p_application
        and s.status <> 'not_started'
        and a.status <> 'draft'
    )
  );
$$;

create or replace function private.can_view_application(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.owns_application(p_application) or private.can_staff_view_application(p_application);
$$;

create or replace function private.can_upload_to_application(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.applications
    where id = p_application
      and applicant_id = auth.uid()
      and status in ('draft', 'awaiting_applicant')
  );
$$;

create or replace function private.member_of_agency(p_agency uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and agency_id = p_agency
      and role in ('reviewer', 'agency_admin')
  );
$$;

create or replace function private.is_lead_staff(p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.applications a
    join public.application_types t on t.id = a.application_type_id
    join public.memberships m
      on m.agency_id = t.lead_agency_id
     and m.user_id = auth.uid()
     and m.role in ('reviewer', 'agency_admin')
    where a.id = p_application
  );
$$;

create or replace function private.app_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'draft' then p_to in ('submitted', 'withdrawn')
    when 'submitted' then p_to in ('intake', 'denied', 'withdrawn')
    when 'intake' then p_to in ('plan_review', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'plan_review' then p_to in ('clearances_in_progress', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'clearances_in_progress' then p_to in ('fees_due', 'awaiting_applicant', 'denied', 'withdrawn')
    when 'awaiting_applicant' then p_to in ('intake', 'plan_review', 'clearances_in_progress', 'fees_due', 'inspections', 'withdrawn')
    when 'fees_due' then p_to in ('issued', 'awaiting_applicant', 'withdrawn', 'expired')
    when 'issued' then p_to in ('inspections', 'expired')
    when 'inspections' then p_to in ('occupancy_issued', 'awaiting_applicant', 'expired')
    else false
  end;
$$;

create or replace function private.step_transition_ok(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'not_started' then p_to in ('queued', 'n_a', 'waived')
    when 'queued' then p_to in ('in_progress', 'info_requested', 'n_a', 'waived')
    when 'in_progress' then p_to in ('info_requested', 'approved', 'rejected', 'n_a', 'waived')
    when 'info_requested' then p_to = 'in_progress'
    else false
  end;
$$;

create or replace function private.step_blocks(p_status text, p_routing text)
returns boolean
language sql
immutable
as $$
  select case
    when p_status in ('approved', 'waived', 'n_a') then false
    when p_status = 'not_started' then p_routing in ('always', 'default_routed')
    else true
  end;
$$;

create or replace function private.phase_status(p_phase text)
returns text
language sql
immutable
as $$
  select case p_phase
    when 'intake' then 'intake'
    when 'plan_review' then 'plan_review'
    when 'clearance' then 'clearances_in_progress'
    when 'fees' then 'fees_due'
    when 'issuance' then 'issued'
    when 'inspection' then 'inspections'
    when 'occupancy' then 'inspections'
  end;
$$;

create or replace function private.memo_ok(p_memo text)
returns boolean
language sql
immutable
as $$
  select coalesce(length(btrim(p_memo)), 0) >= 3;
$$;

create or replace function private.write_audit(
  p_application uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_memo text,
  p_before jsonb,
  p_after jsonb,
  p_visibility text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('permitgu.trusted_audit', '1', true);
  insert into public.audit_log (application_id, actor_id, action, entity, entity_id, memo, before, after, visibility)
  values (p_application, auth.uid(), p_action, p_entity, p_entity_id, nullif(btrim(p_memo), ''), p_before, p_after, p_visibility);
  perform set_config('permitgu.trusted_audit', '', true);
end;
$$;

create or replace function private.guard_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and coalesce(current_setting('permitgu.trusted_audit', true), '') = '1' then
    return new;
  end if;
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_append_only
  before insert or update or delete on public.audit_log
  for each row execute function private.guard_audit();

create or replace function private.protect_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null and coalesce(current_setting('permitgu.trusted_write', true), '') <> '1' then
    new.applicant_id := auth.uid();
    new.status := 'draft';
    new.rfi_return_status := null;
    new.fees_due_cents := null;
    new.fees_paid_at := null;
    new.fees_paid_by := null;
    new.permit_number := null;
    new.submitted_at := null;
  elsif tg_op = 'UPDATE' and auth.uid() is not null and coalesce(current_setting('permitgu.trusted_write', true), '') <> '1' then
    if new.status is distinct from old.status
      or new.applicant_id is distinct from old.applicant_id
      or new.application_type_id is distinct from old.application_type_id
      or new.rfi_return_status is distinct from old.rfi_return_status
      or new.fees_due_cents is distinct from old.fees_due_cents
      or new.fees_paid_at is distinct from old.fees_paid_at
      or new.fees_paid_by is distinct from old.fees_paid_by
      or new.permit_number is distinct from old.permit_number
      or new.submitted_at is distinct from old.submitted_at
    then
      raise exception 'restricted_column';
    end if;
    if old.status <> 'draft' then
      raise exception 'application_locked';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger applications_protect
  before insert or update on public.applications
  for each row execute function private.protect_application();

create or replace function private.set_app_status(p_application uuid, p_status text, p_memo text, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  select status into v_old from public.applications where id = p_application for update;
  if not private.app_transition_ok(v_old, p_status) then
    raise exception 'illegal_application_transition';
  end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications
    set status = p_status,
        submitted_at = case when p_status = 'submitted' and submitted_at is null then now() else submitted_at end
    where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(p_application, p_action, 'application', p_application, p_memo,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status), 'citizen');
end;
$$;

create or replace function private.phase_clear(p_application uuid, p_phase text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.application_steps s
    join public.workflow_steps w on w.id = s.workflow_step_id
    where s.application_id = p_application
      and w.phase = p_phase
      and private.step_blocks(s.status, w.routing)
  );
$$;

create or replace function private.queue_phase(p_application uuid, p_phase text, p_routings text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codes text[];
begin
  select coalesce(array_agg(w.code order by w.sort_order), array[]::text[]) into v_codes
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  where s.application_id = p_application
    and w.phase = p_phase
    and s.status = 'not_started'
    and w.routing = any(p_routings);
  update public.application_steps s
    set status = 'queued', updated_at = now()
  from public.workflow_steps w
  where s.workflow_step_id = w.id
    and s.application_id = p_application
    and w.phase = p_phase
    and s.status = 'not_started'
    and w.routing = any(p_routings);
  if coalesce(array_length(v_codes, 1), 0) > 0 then
    perform private.write_audit(p_application, 'steps_queued', 'application', p_application, null,
      null, jsonb_build_object('steps', v_codes), 'citizen');
  end if;
end;
$$;

create or replace function private.queue_code(p_application uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.application_steps s
    set status = 'queued', updated_at = now()
  from public.workflow_steps w
  where s.workflow_step_id = w.id
    and s.application_id = p_application
    and w.code = p_code
    and s.status = 'not_started';
  get diagnostics v_updated = row_count;
  if v_updated > 0 then
    perform private.write_audit(p_application, 'steps_queued', 'application', p_application, null,
      null, jsonb_build_object('steps', jsonb_build_array(p_code)), 'citizen');
  end if;
end;
$$;

create or replace function private.step_status_code(p_application uuid, p_code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.status
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  where s.application_id = p_application and w.code = p_code;
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
    perform private.set_app_status(p_application, 'plan_review', 'Plan-review steps on the default template are queued.', 'advance');
    perform private.queue_phase(p_application, 'plan_review', array['always', 'default_routed']);
    v_status := 'plan_review';
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

create or replace function private.ensure_steps(p_application uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid;
begin
  select application_type_id into v_type from public.applications where id = p_application;
  insert into public.application_steps (application_id, workflow_step_id, agency_id, status)
  select p_application, w.id, w.agency_id, 'not_started'
  from public.workflow_steps w
  where w.application_type_id = v_type
    and not exists (
      select 1 from public.application_steps s
      where s.application_id = p_application and s.workflow_step_id = w.id
    );
end;
$$;

create or replace function private.require_staff()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if private.aal() <> 'aal2' then raise exception 'mfa_required'; end if;
end;
$$;

create or replace function private.create_draft(
  p_lot text, p_tract text, p_block text, p_zoning_district text, p_ownership text,
  p_owner_name text, p_scope text, p_valuation_cents bigint, p_sewage text, p_water_supply text,
  p_contractor_license text, p_architect_seal text, p_engineer_seal text,
  p_attestation boolean, p_attestation_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_type uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_sewage is not null and p_sewage <> 'public_sewer' then raise exception 'not_ready: public sewer'; end if;
  if p_valuation_cents is not null and p_valuation_cents < 0 then raise exception 'bad_valuation'; end if;
  select id into v_type from public.application_types where code = 'building_permit_residential_one_family';
  insert into public.applications (
    applicant_id, application_type_id, status, lot, tract, block, zoning_district, ownership,
    owner_name, scope, valuation_cents, sewage, water_supply, contractor_license, architect_seal,
    engineer_seal, attestation, attestation_name
  ) values (
    auth.uid(), v_type, 'draft', p_lot, p_tract, p_block, p_zoning_district, nullif(p_ownership, ''),
    nullif(p_owner_name, ''), p_scope, p_valuation_cents, nullif(p_sewage, ''), nullif(p_water_supply, ''),
    nullif(p_contractor_license, ''), nullif(p_architect_seal, ''), nullif(p_engineer_seal, ''),
    coalesce(p_attestation, false), nullif(p_attestation_name, '')
  ) returning id into v_id;
  perform private.ensure_steps(v_id);
  perform private.write_audit(v_id, 'draft_created', 'application', v_id, null, null, jsonb_build_object('status', 'draft'), 'citizen');
  return v_id;
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
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select * into v from public.applications where id = p_application and applicant_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'draft' then raise exception 'illegal_application_transition'; end if;
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
  perform private.ensure_steps(p_application);
  perform private.set_app_status(p_application, 'submitted', 'Application submitted in this unofficial tracker.', 'submit');
  perform private.queue_phase(p_application, 'intake', array['always', 'default_routed']);
end;
$$;

create or replace function private.review_step(p_step_id uuid, p_status text, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.application_steps;
  v_phase text;
  v_app_status text;
  v_target text;
begin
  perform private.require_staff();
  select * into v_step from public.application_steps where id = p_step_id;
  if not found then raise exception 'not_found'; end if;
  if not (private.is_super_admin() or private.member_of_agency(v_step.agency_id)) then
    raise exception 'wrong_agency';
  end if;
  if not private.step_transition_ok(v_step.status, p_status) then raise exception 'illegal_step_transition'; end if;
  if p_status in ('rejected', 'n_a', 'waived') and not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  update public.application_steps
    set status = p_status, memo = coalesce(nullif(btrim(p_memo), ''), memo), updated_at = now()
    where id = p_step_id;
  perform private.write_audit(v_step.application_id, 'review_step', 'application_step', p_step_id, p_memo,
    jsonb_build_object('status', v_step.status), jsonb_build_object('status', p_status),
    case when p_status in ('approved', 'rejected', 'n_a', 'waived') then 'citizen' else 'staff' end);
  select w.phase, a.status into v_phase, v_app_status
  from public.workflow_steps w
  join public.applications a on a.id = v_step.application_id
  where w.id = v_step.workflow_step_id;
  if p_status = 'in_progress' then
    v_target := private.phase_status(v_phase);
    if v_app_status is distinct from v_target and private.app_transition_ok(v_app_status, v_target) then
      perform private.set_app_status(v_step.application_id, v_target, p_memo, 'status');
    end if;
  elsif p_status <> 'rejected' then
    perform private.maybe_advance(v_step.application_id);
  end if;
end;
$$;

create or replace function private.route_step(p_step_id uuid, p_status text, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.application_steps;
begin
  perform private.require_staff();
  if p_status not in ('queued', 'n_a', 'waived') then raise exception 'illegal_step_transition'; end if;
  select * into v_step from public.application_steps where id = p_step_id;
  if not found then raise exception 'not_found'; end if;
  if not (private.is_super_admin() or private.is_lead_staff(v_step.application_id)) then
    raise exception 'not_orchestrator';
  end if;
  if not private.step_transition_ok(v_step.status, p_status) then raise exception 'illegal_step_transition'; end if;
  if p_status in ('n_a', 'waived') and not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  update public.application_steps set status = p_status, memo = coalesce(nullif(btrim(p_memo), ''), memo), updated_at = now()
    where id = p_step_id;
  perform private.write_audit(v_step.application_id, 'route_step', 'application_step', p_step_id, p_memo,
    jsonb_build_object('status', v_step.status), jsonb_build_object('status', p_status), 'citizen');
  perform private.maybe_advance(v_step.application_id);
end;
$$;

create or replace function private.request_info(p_step_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.application_steps;
  v_status text;
  v_id uuid;
begin
  perform private.require_staff();
  if not private.memo_ok(p_body) then raise exception 'memo_required'; end if;
  select * into v_step from public.application_steps where id = p_step_id;
  if not found then raise exception 'not_found'; end if;
  if not (private.is_super_admin() or private.member_of_agency(v_step.agency_id)) then raise exception 'wrong_agency'; end if;
  if not private.step_transition_ok(v_step.status, 'info_requested') then raise exception 'illegal_step_transition'; end if;
  select status into v_status from public.applications where id = v_step.application_id;
  if not private.app_transition_ok(v_status, 'awaiting_applicant') then raise exception 'illegal_application_transition'; end if;
  update public.application_steps set status = 'info_requested', updated_at = now() where id = p_step_id;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications
    set rfi_return_status = case when status = 'awaiting_applicant' then rfi_return_status else status end,
        status = 'awaiting_applicant'
    where id = v_step.application_id;
  perform set_config('permitgu.trusted_write', '', true);
  insert into public.info_requests (application_id, step_id, author_id, body)
  values (v_step.application_id, p_step_id, auth.uid(), btrim(p_body))
  returning id into v_id;
  perform private.write_audit(v_step.application_id, 'info_requested', 'info_request', v_id, p_body,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'awaiting_applicant'), 'citizen');
  return v_id;
end;
$$;

create or replace function private.respond_info(p_request uuid, p_response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.info_requests;
  v_open integer;
  v_back text;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if not private.memo_ok(p_response) then raise exception 'memo_required'; end if;
  select * into v_req from public.info_requests where id = p_request;
  if not found or v_req.response is not null then raise exception 'not_found'; end if;
  if not private.owns_application(v_req.application_id) then raise exception 'not_found'; end if;
  update public.info_requests set response = btrim(p_response), responded_at = now() where id = p_request;
  update public.application_steps set status = 'in_progress', updated_at = now() where id = v_req.step_id and status = 'info_requested';
  select count(*) into v_open from public.info_requests where application_id = v_req.application_id and response is null;
  if v_open = 0 then
    select rfi_return_status into v_back from public.applications where id = v_req.application_id;
    perform private.set_app_status(v_req.application_id, v_back, p_response, 'info_response');
    perform set_config('permitgu.trusted_write', '1', true);
    update public.applications set rfi_return_status = null where id = v_req.application_id;
    perform set_config('permitgu.trusted_write', '', true);
  else
    perform private.write_audit(v_req.application_id, 'info_response', 'info_request', p_request, p_response, null, null, 'citizen');
  end if;
end;
$$;

create or replace function private.withdraw_application(p_application uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.owns_application(p_application) then raise exception 'not_found'; end if;
  perform private.set_app_status(p_application, 'withdrawn', p_memo, 'withdraw');
end;
$$;

create or replace function private.deny_application(p_application uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  if not (private.is_super_admin() or private.is_lead_staff(p_application)) then raise exception 'not_orchestrator'; end if;
  perform private.set_app_status(p_application, 'denied', p_memo, 'deny');
end;
$$;

create or replace function private.expire_application(p_application uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  if not (private.is_super_admin() or private.is_lead_staff(p_application)) then raise exception 'not_orchestrator'; end if;
  perform private.set_app_status(p_application, 'expired', p_memo, 'expire');
end;
$$;

create or replace function private.assess_fees(p_application uuid, p_cents bigint, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_step uuid;
  v_step_status text;
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  if p_cents is null or p_cents < 0 then raise exception 'fee_amount_required'; end if;
  if not (private.is_super_admin() or private.is_lead_staff(p_application)) then raise exception 'not_orchestrator'; end if;
  select status into v_status from public.applications where id = p_application;
  if v_status <> 'fees_due' then raise exception 'illegal_application_transition'; end if;
  select s.id, s.status into v_step, v_step_status
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  where s.application_id = p_application and w.code = 'fee_assessment';
  if v_step_status = 'not_started' then
    update public.application_steps set status = 'queued', updated_at = now() where id = v_step;
    v_step_status := 'queued';
  end if;
  if v_step_status = 'queued' then
    update public.application_steps set status = 'in_progress', updated_at = now() where id = v_step;
    v_step_status := 'in_progress';
  end if;
  if v_step_status <> 'approved' then
    if not private.step_transition_ok(v_step_status, 'approved') then raise exception 'illegal_step_transition'; end if;
    update public.application_steps set status = 'approved', memo = btrim(p_memo), updated_at = now() where id = v_step;
  end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set fees_due_cents = p_cents where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.queue_code(p_application, 'tog_payment');
  perform private.write_audit(p_application, 'assess_fees', 'application', p_application, p_memo,
    null, jsonb_build_object('fees_due_cents', p_cents), 'citizen');
end;
$$;

create or replace function private.mark_fees_paid(p_application uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cents bigint;
  v_step uuid;
  v_step_status text;
  v_tog uuid;
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  select id into v_tog from public.agencies where code = 'tog';
  if not (private.is_super_admin() or private.is_lead_staff(p_application) or private.member_of_agency(v_tog)) then
    raise exception 'wrong_agency';
  end if;
  select fees_due_cents into v_cents from public.applications where id = p_application;
  if v_cents is null then raise exception 'fee_amount_required'; end if;
  select s.id, s.status into v_step, v_step_status
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  where s.application_id = p_application and w.code = 'tog_payment';
  if v_step_status = 'not_started' then raise exception 'illegal_step_transition'; end if;
  if v_step_status = 'queued' then
    update public.application_steps set status = 'in_progress', updated_at = now() where id = v_step;
    v_step_status := 'in_progress';
  end if;
  if v_step_status <> 'approved' then
    if not private.step_transition_ok(v_step_status, 'approved') then raise exception 'illegal_step_transition'; end if;
    update public.application_steps set status = 'approved', memo = btrim(p_memo), updated_at = now() where id = v_step;
  end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set fees_paid_at = now(), fees_paid_by = auth.uid() where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(p_application, 'fees_paid_in_person', 'application', p_application, p_memo,
    null, jsonb_build_object('fees_due_cents', v_cents), 'citizen');
end;
$$;

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
  where s.application_id = p_application and w.code = 'dpw_issue_permit';
  if v_step_status = 'not_started' then
    update public.application_steps set status = 'in_progress', updated_at = now() where id = v_step;
    v_step_status := 'in_progress';
  elsif v_step_status = 'queued' then
    update public.application_steps set status = 'in_progress', updated_at = now() where id = v_step;
    v_step_status := 'in_progress';
  end if;
  if v_step_status <> 'approved' then
    update public.application_steps set status = 'approved', memo = btrim(p_memo), updated_at = now() where id = v_step;
  end if;
  perform private.set_app_status(p_application, 'inspections', 'Provisional inspections queued. The checklist is not confirmed by DPW.', 'advance');
  perform private.queue_phase(p_application, 'inspection', array['provisional', 'always', 'default_routed']);
  perform private.write_audit(p_application, 'permit_number', 'application', p_application,
    'Demo permit number. Not an official DPW number.', null, jsonb_build_object('permit_number', v_number), 'citizen');
  return v_number;
end;
$$;

create or replace function private.reopen_step(p_step_id uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.application_steps;
  v_phase text;
  v_target text;
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  select * into v_step from public.application_steps where id = p_step_id;
  if not found then raise exception 'not_found'; end if;
  if v_step.status not in ('approved', 'rejected', 'waived', 'n_a') then raise exception 'illegal_step_transition'; end if;
  select phase into v_phase from public.workflow_steps where id = v_step.workflow_step_id;
  v_target := private.phase_status(v_phase);
  update public.application_steps set status = 'in_progress', memo = btrim(p_memo), updated_at = now() where id = p_step_id;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set status = v_target where id = v_step.application_id;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(v_step.application_id, 'break_glass', 'application_step', p_step_id, p_memo,
    jsonb_build_object('status', v_step.status), jsonb_build_object('status', 'in_progress', 'application_status', v_target), 'staff');
end;
$$;

create or replace function private.grant_membership(p_email text, p_agency_code text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_agency uuid;
begin
  perform private.require_staff();
  select id into v_user from public.profiles where lower(email) = lower(btrim(p_email));
  if v_user is null then raise exception 'user_not_found'; end if;
  if p_role = 'super_admin' then
    if not private.is_super_admin() then raise exception 'not_authorized'; end if;
    insert into public.memberships (user_id, agency_id, role) values (v_user, null, 'super_admin')
      on conflict do nothing;
  elsif p_role in ('reviewer', 'agency_admin') then
    select id into v_agency from public.agencies where code = p_agency_code;
    if v_agency is null then raise exception 'unknown_agency'; end if;
    if p_role = 'agency_admin' and not private.is_super_admin() then raise exception 'not_authorized'; end if;
    if p_role = 'reviewer' and not (private.is_super_admin() or private.is_agency_admin(v_agency)) then
      raise exception 'not_authorized';
    end if;
    insert into public.memberships (user_id, agency_id, role) values (v_user, v_agency, p_role)
      on conflict do nothing;
  else
    raise exception 'bad_role';
  end if;
  perform private.write_audit(null, 'grant_membership', 'membership', v_user, p_email,
    null, jsonb_build_object('role', p_role, 'agency', p_agency_code), 'staff');
end;
$$;

create or replace function private.revoke_membership(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.memberships;
begin
  perform private.require_staff();
  select * into v from public.memberships where id = p_membership;
  if not found or v.role = 'citizen' then raise exception 'not_found'; end if;
  if v.role = 'super_admin' and not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if v.role = 'agency_admin' and not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if v.role = 'reviewer' and not (private.is_super_admin() or private.is_agency_admin(v.agency_id)) then
    raise exception 'not_authorized';
  end if;
  delete from public.memberships where id = p_membership;
  perform private.write_audit(null, 'revoke_membership', 'membership', p_membership, null,
    jsonb_build_object('user_id', v.user_id, 'role', v.role), null, 'staff');
end;
$$;

create or replace function private.update_workflow_step(p_code text, p_routing text, p_uncertainty text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.workflow_steps;
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if p_routing not in ('always', 'default_routed', 'as_indicated', 'gated', 'provisional') then
    raise exception 'bad_routing';
  end if;
  select * into v from public.workflow_steps w
  join public.application_types t on t.id = w.application_type_id
  where w.code = p_code and t.code = 'building_permit_residential_one_family';
  if not found then raise exception 'not_found'; end if;
  update public.workflow_steps set routing = p_routing, uncertainty = nullif(btrim(p_uncertainty), '') where id = v.id;
  perform private.write_audit(null, 'update_workflow_step', 'workflow_step', v.id, p_uncertainty,
    jsonb_build_object('routing', v.routing), jsonb_build_object('routing', p_routing), 'staff');
end;
$$;

create or replace function private.add_comment(p_application uuid, p_body text, p_visibility text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_visibility text;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if not private.memo_ok(p_body) then raise exception 'memo_required'; end if;
  if private.can_staff_view_application(p_application) then
    v_visibility := case when p_visibility = 'staff' then 'staff' else 'citizen' end;
  elsif private.owns_application(p_application) then
    v_visibility := 'citizen';
  else
    raise exception 'not_found';
  end if;
  insert into public.comments (application_id, author_id, body, visibility)
  values (p_application, auth.uid(), btrim(p_body), v_visibility)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.step_internal_note(p_step_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_steps;
begin
  if private.aal() <> 'aal2' then return null; end if;
  select * into v from public.application_steps where id = p_step_id;
  if not found then return null; end if;
  if private.is_super_admin() or private.is_lead_staff(v.application_id) or private.member_of_agency(v.agency_id) then
    return v.internal_note;
  end if;
  return null;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, 'person'), '@', 1)),
    coalesce(new.email, new.id::text || '@example.com')
  );
  insert into public.memberships (user_id, role, agency_id) values (new.id, 'citizen', null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Public wrappers are security invoker. The private functions above are the privileged path.
-- Each wrapper is granted to authenticated below.

create or replace function public.create_draft(
  p_lot text, p_tract text, p_block text, p_zoning_district text, p_ownership text,
  p_owner_name text, p_scope text, p_valuation_cents bigint, p_sewage text, p_water_supply text,
  p_contractor_license text, p_architect_seal text, p_engineer_seal text,
  p_attestation boolean, p_attestation_name text
) returns uuid language sql security invoker set search_path = public, private
as $$ select private.create_draft(p_lot, p_tract, p_block, p_zoning_district, p_ownership, p_owner_name, p_scope, p_valuation_cents, p_sewage, p_water_supply, p_contractor_license, p_architect_seal, p_engineer_seal, p_attestation, p_attestation_name); $$;

create or replace function public.submit_application(p_application_id uuid)
returns void language sql security invoker set search_path = public, private
as $$ select private.submit_application(p_application_id); $$;

create or replace function public.review_step(p_step_id uuid, p_status text, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.review_step(p_step_id, p_status, p_memo); $$;

create or replace function public.route_step(p_step_id uuid, p_status text, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.route_step(p_step_id, p_status, p_memo); $$;

create or replace function public.request_info(p_step_id uuid, p_body text)
returns uuid language sql security invoker set search_path = public, private
as $$ select private.request_info(p_step_id, p_body); $$;

create or replace function public.respond_info(p_request_id uuid, p_response text)
returns void language sql security invoker set search_path = public, private
as $$ select private.respond_info(p_request_id, p_response); $$;

create or replace function public.withdraw_application(p_application_id uuid, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.withdraw_application(p_application_id, p_memo); $$;

create or replace function public.deny_application(p_application_id uuid, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.deny_application(p_application_id, p_memo); $$;

create or replace function public.expire_application(p_application_id uuid, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.expire_application(p_application_id, p_memo); $$;

create or replace function public.assess_fees(p_application_id uuid, p_cents bigint, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.assess_fees(p_application_id, p_cents, p_memo); $$;

create or replace function public.mark_fees_paid(p_application_id uuid, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.mark_fees_paid(p_application_id, p_memo); $$;

create or replace function public.issue_permit(p_application_id uuid, p_memo text)
returns text language sql security invoker set search_path = public, private
as $$ select private.issue_permit(p_application_id, p_memo); $$;

create or replace function public.reopen_step(p_step_id uuid, p_memo text)
returns void language sql security invoker set search_path = public, private
as $$ select private.reopen_step(p_step_id, p_memo); $$;

create or replace function public.grant_membership(p_email text, p_agency_code text, p_role text)
returns void language sql security invoker set search_path = public, private
as $$ select private.grant_membership(p_email, p_agency_code, p_role); $$;

create or replace function public.revoke_membership(p_membership_id uuid)
returns void language sql security invoker set search_path = public, private
as $$ select private.revoke_membership(p_membership_id); $$;

create or replace function public.update_workflow_step(p_code text, p_routing text, p_uncertainty text)
returns void language sql security invoker set search_path = public, private
as $$ select private.update_workflow_step(p_code, p_routing, p_uncertainty); $$;

create or replace function public.add_comment(p_application_id uuid, p_body text, p_visibility text)
returns uuid language sql security invoker set search_path = public, private
as $$ select private.add_comment(p_application_id, p_body, p_visibility); $$;

create or replace function public.step_internal_note(p_step_id uuid)
returns text language sql security invoker set search_path = public, private
as $$ select private.step_internal_note(p_step_id); $$;

-- REFERENCE DATA generated from lib/template.ts
insert into public.agencies (code, name, acronym, website) values
  ('dpw', 'Department of Public Works', 'DPW', 'https://dpw.guam.gov/blpc/'),
  ('dlm', 'Department of Land Management', 'DLM', 'https://dlm.guam.gov/'),
  ('gepa', 'Guam Environmental Protection Agency', 'GEPA', 'https://epa.guam.gov/applications/'),
  ('gwa', 'Guam Waterworks Authority', 'GWA', 'https://dpw.guam.gov/blpc/'),
  ('gpa', 'Guam Power Authority', 'GPA', 'https://dpw.guam.gov/blpc/'),
  ('gfd', 'Guam Fire Department', 'GFD', 'https://gfd.guam.gov/forms/'),
  ('dphss', 'Department of Public Health and Social Services', 'DPHSS', 'https://dphss.guam.gov/'),
  ('clb', 'Contractors License Board', 'CLB', 'https://clb.guam.gov/'),
  ('peals', 'PEALS Board', 'PEALS', 'https://peals.guam.gov/'),
  ('dpr', 'Department of Parks and Recreation', 'DPR', 'https://dpw.guam.gov/blpc/'),
  ('doag', 'Department of Agriculture', 'DoAg', 'https://dpw.guam.gov/blpc/'),
  ('usace', 'U.S. Army Corps of Engineers', 'USACE', 'https://bsp.guam.gov/guam-development-guidebook/'),
  ('ghpo', 'Guam Historic Preservation Office', 'GHPO', 'https://www.territorialreview.org/statute/21-gca-76511'),
  ('tog', 'Treasurer of Guam', 'TOG', 'https://dpw.guam.gov/blpc/');

insert into public.application_types (code, name, lead_agency_id, summary)
select 'building_permit_residential_one_family', 'Residential building permit, private one-family new build', id, 'Unofficial tracker for a private one-family house on public sewer. Wetland, seashore, GLUC, and septic paths are out of this flow.'
from public.agencies where code = 'dpw';

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, 'dpw_intake', 'DPW intake', a.id, 'intake', 'always', 10, null
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_architectural', 'Architectural plan review', a.id, 'plan_review', 'default_routed', 20, 'Assumed for a new one-family building. The DPW form treats plan-review disciplines as indicated. Confirm with DPW before treating this as always required.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_structural', 'Structural plan review', a.id, 'plan_review', 'default_routed', 30, 'Assumed for a new one-family building. The DPW form treats plan-review disciplines as indicated. Confirm with DPW before treating this as always required.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_mechanical_plumbing', 'Mechanical and plumbing plan review', a.id, 'plan_review', 'as_indicated', 40, 'DPW plan-review discipline. Route only if it applies. Not default-routed on this template.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_flood_control', 'Flood control review', a.id, 'plan_review', 'as_indicated', 50, 'On the DPW plan-review list. Route when the lot is in a flood zone. Not default-routed.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_hpcc', 'HPCC plan review', a.id, 'plan_review', 'as_indicated', 60, 'Printed as HPCC on the DPW plan-review list used for this template. The expansion of that acronym is not confirmed here.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_hydraulics_civil', 'Hydraulics and civil plan review', a.id, 'plan_review', 'as_indicated', 70, 'DPW plan-review discipline. Route only if it applies. Not default-routed on this template.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dpw_highway_row', 'Highway, right-of-way, and traffic review', a.id, 'plan_review', 'as_indicated', 80, 'DPW plan-review discipline. Route only if the work touches a road or right of way. Not default-routed.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'dlm_zoning', 'Zoning examination', a.id, 'clearance', 'always', 90, null
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dlm'
union all
select t.id, 'gepa_review', 'GEPA building-permit review', a.id, 'clearance', 'as_indicated', 100, 'GEPA reviews building permits and wastewater. This flow is public sewer only, not septic or ANODS. Whether GEPA is always routed for a sewered one-family house is not confirmed, so it is not default-routed.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'gepa'
union all
select t.id, 'gwa_availability', 'GWA water and sewer availability', a.id, 'clearance', 'default_routed', 110, 'Default-routed because this flow assumes public water and public sewer. Confirm with DPW and GWA for a typical house.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'gwa'
union all
select t.id, 'gpa_clearance', 'GPA power clearance', a.id, 'clearance', 'as_indicated', 120, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'gpa'
union all
select t.id, 'gfd_fire', 'Fire Prevention plan check', a.id, 'clearance', 'as_indicated', 130, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'gfd'
union all
select t.id, 'dphss_clearance', 'Public Health clearance', a.id, 'clearance', 'as_indicated', 140, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dphss'
union all
select t.id, 'clb_clearance', 'Contractors License Board clearance', a.id, 'clearance', 'as_indicated', 150, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'clb'
union all
select t.id, 'peals_stamp', 'PEALS registration check', a.id, 'clearance', 'as_indicated', 160, 'The DPW form asks for an architect or engineer seal number as required. PEALS registration is not confirmed as its own clearance on every house.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'peals'
union all
select t.id, 'dpr_clearance', 'Parks and Recreation clearance', a.id, 'clearance', 'as_indicated', 170, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpr'
union all
select t.id, 'agriculture_clearance', 'Agriculture clearance', a.id, 'clearance', 'as_indicated', 180, 'Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'doag'
union all
select t.id, 'usace_clearance', 'USACE clearance', a.id, 'clearance', 'as_indicated', 190, 'Listed on the DPW application. A private one-family house on public sewer with no wetland or seashore work is assumed not to need USACE. That is not an official determination.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'usace'
union all
select t.id, 'historic_preservation', 'Historic preservation certificate of approval', a.id, 'clearance', 'gated', 200, '21 GCA §76511 requires a certificate of approval when it applies. When it is N/A for a typical house is not confirmed. Staff can mark this step n/a with a reason. It does not block other clearances while it is not started.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'ghpo'
union all
select t.id, 'fee_assessment', 'Fee assessment', a.id, 'fees', 'always', 210, 'No dollar amount is stored on the template. Staff enter the assessed amount on the application. The published dollar schedule is not confirmed.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'tog_payment', 'In-person payment at Treasurer of Guam', a.id, 'fees', 'always', 220, 'Paid in person at the BLPC cashier. Permit GU does not take payment online.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'tog'
union all
select t.id, 'dpw_issue_permit', 'Issue building permit', a.id, 'issuance', 'always', 230, 'The permit number this demo assigns is not an official DPW number.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'insp_foundation', 'Foundation inspection', a.id, 'inspection', 'provisional', 240, 'Provisional. The DPW Director sets the inspection list (21 GCA §66403). Foundation, framing, and final are a placeholder, not a confirmed home checklist.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'insp_framing', 'Framing inspection', a.id, 'inspection', 'provisional', 250, 'Provisional. The DPW Director sets the inspection list (21 GCA §66403). Not confirmed as DPW''s current home checklist.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'insp_final', 'Final inspection', a.id, 'inspection', 'provisional', 260, 'Provisional. The DPW Director sets the inspection list (21 GCA §66403). Not confirmed as DPW''s current home checklist.'
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw'
union all
select t.id, 'certificate_of_occupancy', 'Certificate of occupancy', a.id, 'occupancy', 'always', 270, null
from public.application_types t, public.agencies a
where t.code = 'building_permit_residential_one_family' and a.code = 'dpw';


-- RLS
alter table public.roles enable row level security;
alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.application_types enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.applications enable row level security;
alter table public.application_steps enable row level security;
alter table public.documents enable row level security;
alter table public.info_requests enable row level security;
alter table public.comments enable row level security;
alter table public.audit_log enable row level security;

alter table public.roles force row level security;
alter table public.agencies force row level security;
alter table public.profiles force row level security;
alter table public.memberships force row level security;
alter table public.application_types force row level security;
alter table public.workflow_steps force row level security;
alter table public.applications force row level security;
alter table public.application_steps force row level security;
alter table public.documents force row level security;
alter table public.info_requests force row level security;
alter table public.comments force row level security;
alter table public.audit_log force row level security;

revoke all on public.roles, public.agencies, public.profiles, public.memberships, public.application_types,
  public.workflow_steps, public.applications, public.application_steps, public.documents, public.info_requests,
  public.comments, public.audit_log from public, anon, authenticated;
revoke all on sequence public.demo_permit_seq from public, anon, authenticated;

grant select on public.roles, public.agencies, public.application_types, public.workflow_steps to authenticated;
grant select, update (full_name) on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select (
  id, applicant_id, application_type_id, status, rfi_return_status, lot, tract, block, zoning_district,
  ownership, owner_name, scope, valuation_cents, sewage, water_supply, contractor_license, architect_seal,
  engineer_seal, attestation, attestation_name, fees_due_cents, fees_paid_at, fees_paid_by, permit_number,
  submitted_at, created_at, updated_at
) on public.applications to authenticated;
grant insert (
  applicant_id, application_type_id, status, lot, tract, block, zoning_district, ownership, owner_name,
  scope, valuation_cents, sewage, water_supply, contractor_license, architect_seal, engineer_seal,
  attestation, attestation_name
) on public.applications to authenticated;
grant update (
  lot, tract, block, zoning_district, ownership, owner_name, scope, valuation_cents, sewage, water_supply,
  contractor_license, architect_seal, engineer_seal, attestation, attestation_name
) on public.applications to authenticated;
grant select (
  id, application_id, workflow_step_id, agency_id, status, assignee_id, memo, updated_at
) on public.application_steps to authenticated;
grant select, insert, delete on public.documents to authenticated;
grant select on public.info_requests, public.comments, public.audit_log to authenticated;

create policy roles_read on public.roles for select to authenticated using (true);
create policy agencies_read on public.agencies for select to authenticated using (true);
create policy types_read on public.application_types for select to authenticated using (true);
create policy steps_read on public.workflow_steps for select to authenticated using (true);

create policy profiles_select on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.applications a
    where a.applicant_id = profiles.id and private.can_staff_view_application(a.id)
  )
);
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    private.aal() = 'aal2'
    and (private.is_super_admin() or private.is_agency_admin(memberships.agency_id))
  )
);

create policy applications_select on public.applications for select to authenticated
using (
  applicant_id = (select auth.uid())
  or private.can_staff_view_application(id)
);
create policy applications_insert on public.applications for insert to authenticated
with check (applicant_id = (select auth.uid()) and status = 'draft');
create policy applications_update on public.applications for update to authenticated
using (applicant_id = (select auth.uid()) and status = 'draft')
with check (applicant_id = (select auth.uid()) and status = 'draft');

create policy application_steps_select on public.application_steps for select to authenticated
using (private.can_view_application(application_id));

create policy documents_select on public.documents for select to authenticated
using (private.can_view_application(application_id));
create policy documents_insert on public.documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and private.can_upload_to_application(application_id)
  and storage_path like application_id::text || '/%'
  and storage_path not like '%..%'
);
create policy documents_delete on public.documents for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.applications a
    where a.id = documents.application_id and a.applicant_id = (select auth.uid()) and a.status = 'draft'
  )
);

create policy info_requests_select on public.info_requests for select to authenticated
using (private.can_view_application(application_id));
create policy comments_select on public.comments for select to authenticated
using (
  private.can_view_application(application_id)
  and (visibility = 'citizen' or private.can_staff_view_application(application_id))
);
create policy audit_select on public.audit_log for select to authenticated
using (
  (visibility = 'citizen' and application_id is not null and private.owns_application(application_id))
  or (private.aal() = 'aal2' and private.is_super_admin())
  or (
    private.aal() = 'aal2'
    and application_id is not null
    and private.can_staff_view_application(application_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Hosted Supabase already enables RLS on storage.objects, and the migration
-- role is not the table owner (42501). Enable it only when this role owns the
-- table, which is the case for local PGlite and the Supabase CLI.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and pg_get_userbyid(c.relowner) = current_user
  ) then
    execute 'alter table storage.objects enable row level security';
  end if;
end $$;

drop policy if exists permitgu_documents_select on storage.objects;
drop policy if exists permitgu_documents_insert on storage.objects;
drop policy if exists permitgu_documents_delete on storage.objects;

create policy permitgu_documents_select on storage.objects for select to authenticated
using (
  bucket_id = 'application-documents'
  and name not like '%..%'
  and private.can_view_application((storage.foldername(name))[1]::uuid)
);

create policy permitgu_documents_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'application-documents'
  and name not like '%..%'
  and private.can_upload_to_application((storage.foldername(name))[1]::uuid)
);

create policy permitgu_documents_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'application-documents'
  and private.can_upload_to_application((storage.foldername(name))[1]::uuid)
  and exists (
    select 1 from public.applications a
    where a.id = (storage.foldername(name))[1]::uuid and a.status = 'draft'
  )
);

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.create_draft(text, text, text, text, text, text, text, bigint, text, text, text, text, text, boolean, text),
  public.submit_application(uuid),
  public.review_step(uuid, text, text),
  public.route_step(uuid, text, text),
  public.request_info(uuid, text),
  public.respond_info(uuid, text),
  public.withdraw_application(uuid, text),
  public.deny_application(uuid, text),
  public.expire_application(uuid, text),
  public.assess_fees(uuid, bigint, text),
  public.mark_fees_paid(uuid, text),
  public.issue_permit(uuid, text),
  public.reopen_step(uuid, text),
  public.grant_membership(text, text, text),
  public.revoke_membership(uuid),
  public.update_workflow_step(text, text, text),
  public.add_comment(uuid, text, text),
  public.step_internal_note(uuid)
to authenticated;

grant execute on function
  private.create_draft(text, text, text, text, text, text, text, bigint, text, text, text, text, text, boolean, text),
  private.submit_application(uuid),
  private.review_step(uuid, text, text),
  private.route_step(uuid, text, text),
  private.request_info(uuid, text),
  private.respond_info(uuid, text),
  private.withdraw_application(uuid, text),
  private.deny_application(uuid, text),
  private.expire_application(uuid, text),
  private.assess_fees(uuid, bigint, text),
  private.mark_fees_paid(uuid, text),
  private.issue_permit(uuid, text),
  private.reopen_step(uuid, text),
  private.grant_membership(text, text, text),
  private.revoke_membership(uuid),
  private.update_workflow_step(text, text, text),
  private.add_comment(uuid, text, text),
  private.step_internal_note(uuid),
  private.aal(),
  private.is_super_admin(),
  private.is_agency_admin(uuid),
  private.owns_application(uuid),
  private.can_staff_view_application(uuid),
  private.can_view_application(uuid),
  private.can_upload_to_application(uuid)
to authenticated;
