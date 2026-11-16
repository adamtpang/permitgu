-- Permit builder: a super admin can define a new tracked permit in the admin page,
-- with its own steps, questions, and required papers, and no code change.
-- The house permit and the business license keep their own purpose-built flows.

alter table public.application_types
  add column if not exists noun text not null default 'permit',
  add column if not exists active boolean not null default true,
  add column if not exists builder boolean not null default false,
  add column if not exists fields jsonb not null default '[]'::jsonb,
  add column if not exists source text;
alter table public.application_types drop constraint if exists application_types_fields_shape;
alter table public.application_types add constraint application_types_fields_shape
  check (jsonb_typeof(fields) = 'array' and octet_length(fields::text) <= 20000);
update public.application_types set noun = 'license' where code = 'business_license_new';

-- Room for up to 30 answers on a built permit.
alter table public.applications drop constraint if exists applications_details_shape;
alter table public.applications add constraint applications_details_shape
  check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 40000);

-- The template of an active permit is public: its name, steps, and agencies.
grant select on public.agencies, public.application_types, public.workflow_steps to anon;
drop policy if exists agencies_read_public on public.agencies;
create policy agencies_read_public on public.agencies for select to anon using (true);
drop policy if exists types_read_public on public.application_types;
create policy types_read_public on public.application_types for select to anon using (active);
drop policy if exists steps_read_public on public.workflow_steps;
create policy steps_read_public on public.workflow_steps for select to anon
using (exists (select 1 from public.application_types t where t.id = application_type_id and t.active));

-- A paper's kind is checked against the permit's own list, not one fixed list.
alter table public.documents drop constraint if exists documents_kind_check;
create or replace function private.check_document_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'other' then return new; end if;
  if exists (
    select 1 from public.required_documents r
    join public.applications a on a.application_type_id = r.application_type_id
    where a.id = new.application_id and r.code = new.kind
  ) then
    return new;
  end if;
  raise exception 'bad_document_kind';
end;
$$;
drop trigger if exists documents_check_kind on public.documents;
create trigger documents_check_kind before insert on public.documents
for each row execute function private.check_document_kind();

create or replace function private.slug(p_text text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'g'), '_');
$$;

create or replace function private.builder_type(p_code text)
returns public.application_types
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.application_types;
begin
  select * into v from public.application_types where code = p_code;
  if not found then raise exception 'not_found'; end if;
  if not v.builder then raise exception 'built_in_permit'; end if;
  return v;
end;
$$;

create or replace function private.require_super()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
end;
$$;

-- 1. Defining a permit.
create or replace function private.create_permit_type(
  p_name text, p_noun text, p_lead_agency_code text, p_summary text, p_source text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
  v_lead uuid;
  v_type uuid;
  v_noun text := coalesce(nullif(btrim(p_noun), ''), 'permit');
  v_source text := nullif(btrim(coalesce(p_source, '')), '');
begin
  perform private.require_super();
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'bad_name'; end if;
  if v_noun not in ('permit', 'license', 'certificate', 'clearance', 'registration', 'approval') then raise exception 'bad_noun'; end if;
  if char_length(coalesce(p_summary, '')) > 600 then raise exception 'too_long'; end if;
  if v_source is not null and v_source !~* '^https?://' then raise exception 'bad_source'; end if;
  select id into v_lead from public.agencies where code = p_lead_agency_code;
  if v_lead is null then raise exception 'unknown_agency'; end if;
  v_code := 'x_' || left(private.slug(v_name), 48);
  if exists (select 1 from public.application_types where code = v_code) then raise exception 'already_exists'; end if;
  insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source)
  values (v_code, v_name, v_lead, btrim(coalesce(p_summary, '')), v_noun, false, true, v_source)
  returning id into v_type;
  -- Every permit starts with intake and ends with a fee and an issue step, all with the lead agency.
  insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty) values
    (v_type, 'intake', 'Intake', v_lead, 'intake', 'always', 10, 'The lead agency checks that the application is complete.'),
    (v_type, 'fee_assessment', 'Fee assessment', v_lead, 'fees', 'always', 900, 'No dollar amount is stored. A reviewer types the assessed amount.'),
    (v_type, 'tog_payment', 'Fee paid in person', v_lead, 'fees', 'always', 910, 'PermitGU does not take payment.'),
    (v_type, 'issue', 'Issued', v_lead, 'issuance', 'always', 920, 'The number shown is a demo number, not an official agency number.');
  perform private.write_audit(null, 'create_permit_type', 'application_type', v_type, v_name, null,
    jsonb_build_object('code', v_code), 'staff');
  return v_code;
end;
$$;

create or replace function private.add_type_step(
  p_type_code text, p_name text, p_agency_code text, p_routing text, p_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_name text := btrim(coalesce(p_name, ''));
  v_agency uuid;
  v_code text;
  v_sort integer;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'bad_name'; end if;
  if p_routing not in ('always', 'default_routed', 'as_indicated') then raise exception 'bad_routing'; end if;
  if char_length(coalesce(p_note, '')) > 600 then raise exception 'too_long'; end if;
  select id into v_agency from public.agencies where code = p_agency_code;
  if v_agency is null then raise exception 'unknown_agency'; end if;
  v_code := 's_' || left(private.slug(v_name), 48);
  if exists (select 1 from public.workflow_steps where application_type_id = v.id and code = v_code) then raise exception 'already_exists'; end if;
  select coalesce(max(sort_order), 90) + 10 into v_sort
  from public.workflow_steps where application_type_id = v.id and phase = 'clearance';
  if v_sort >= 900 then raise exception 'too_many_steps'; end if;
  insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
  values (v.id, v_code, v_name, v_agency, 'clearance', p_routing, v_sort, nullif(btrim(coalesce(p_note, '')), ''));
  perform private.write_audit(null, 'add_type_step', 'application_type', v.id, v_name, null,
    jsonb_build_object('step', v_code, 'routing', p_routing), 'staff');
  return v_code;
end;
$$;

create or replace function private.remove_type_step(p_type_code text, p_step_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_step uuid;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  select id into v_step from public.workflow_steps
  where application_type_id = v.id and code = p_step_code and phase = 'clearance';
  if v_step is null then raise exception 'not_found'; end if;
  if exists (select 1 from public.application_steps where workflow_step_id = v_step) then raise exception 'step_in_use'; end if;
  delete from public.workflow_steps where id = v_step;
  perform private.write_audit(null, 'remove_type_step', 'application_type', v.id, p_step_code, null, null, 'staff');
end;
$$;

create or replace function private.add_type_field(
  p_type_code text, p_label text, p_kind text, p_required boolean, p_help text, p_choices text[]
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_label text := btrim(coalesce(p_label, ''));
  v_key text;
  v_choices text[] := coalesce(p_choices, array[]::text[]);
  v_field jsonb;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if char_length(v_label) < 2 or char_length(v_label) > 120 then raise exception 'bad_name'; end if;
  if p_kind not in ('text', 'long', 'choice') then raise exception 'bad_kind'; end if;
  if char_length(coalesce(p_help, '')) > 300 then raise exception 'too_long'; end if;
  if jsonb_array_length(v.fields) >= 30 then raise exception 'too_many_fields'; end if;
  v_key := left(private.slug(v_label), 40);
  if v_key = '' then raise exception 'bad_name'; end if;
  if exists (select 1 from jsonb_array_elements(v.fields) f where f ->> 'key' = v_key) then raise exception 'already_exists'; end if;
  if p_kind = 'choice' then
    select coalesce(array_agg(btrim(c)), array[]::text[]) into v_choices from unnest(v_choices) c where btrim(c) <> '';
    if coalesce(array_length(v_choices, 1), 0) < 2 or array_length(v_choices, 1) > 12 then raise exception 'bad_choices'; end if;
    if exists (select 1 from unnest(v_choices) c where char_length(c) > 80) then raise exception 'bad_choices'; end if;
  else
    v_choices := array[]::text[];
  end if;
  v_field := jsonb_build_object('key', v_key, 'label', v_label, 'kind', p_kind, 'required', coalesce(p_required, false),
    'help', nullif(btrim(coalesce(p_help, '')), ''), 'choices', to_jsonb(v_choices));
  update public.application_types set fields = fields || jsonb_build_array(v_field) where id = v.id;
  perform private.write_audit(null, 'add_type_field', 'application_type', v.id, v_label, null,
    jsonb_build_object('key', v_key, 'kind', p_kind), 'staff');
  return v_key;
end;
$$;

create or replace function private.remove_type_field(p_type_code text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if not exists (select 1 from jsonb_array_elements(v.fields) f where f ->> 'key' = p_key) then raise exception 'not_found'; end if;
  update public.application_types
  set fields = coalesce((select jsonb_agg(f order by ordinality) from jsonb_array_elements(v.fields) with ordinality as t(f, ordinality) where f ->> 'key' <> p_key), '[]'::jsonb)
  where id = v.id;
  perform private.write_audit(null, 'remove_type_field', 'application_type', v.id, p_key, null, null, 'staff');
end;
$$;

create or replace function private.add_type_document(p_type_code text, p_name text, p_notes text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_name text := btrim(coalesce(p_name, ''));
  v_code text;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'bad_name'; end if;
  if char_length(coalesce(p_notes, '')) > 300 then raise exception 'too_long'; end if;
  v_code := left(private.slug(v_name), 40);
  if v_code = '' or v_code = 'other' then raise exception 'bad_name'; end if;
  if exists (select 1 from public.required_documents where application_type_id = v.id and code = v_code) then raise exception 'already_exists'; end if;
  if (select count(*) from public.required_documents where application_type_id = v.id) >= 12 then raise exception 'too_many_documents'; end if;
  insert into public.required_documents (application_type_id, code, name, required, notes)
  values (v.id, v_code, v_name, true, nullif(btrim(coalesce(p_notes, '')), ''));
  perform private.write_audit(null, 'add_type_document', 'application_type', v.id, v_name, null,
    jsonb_build_object('code', v_code), 'staff');
  return v_code;
end;
$$;

create or replace function private.remove_type_document(p_type_code text, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if exists (
    select 1 from public.documents d join public.applications a on a.id = d.application_id
    where a.application_type_id = v.id and d.kind = p_code
  ) then raise exception 'document_in_use'; end if;
  delete from public.required_documents where application_type_id = v.id and code = p_code;
  perform private.write_audit(null, 'remove_type_document', 'application_type', v.id, p_code, null, null, 'staff');
end;
$$;

create or replace function private.set_type_active(p_type_code text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  -- A permit goes live only with a source, a question, and a review step.
  if coalesce(p_active, false) and (
    v.source is null or jsonb_array_length(v.fields) = 0
    or not exists (select 1 from public.workflow_steps where application_type_id = v.id and phase = 'clearance')
  ) then
    raise exception 'not_ready';
  end if;
  update public.application_types set active = coalesce(p_active, false) where id = v.id;
  perform private.write_audit(null, 'set_type_active', 'application_type', v.id, null, null,
    jsonb_build_object('active', coalesce(p_active, false)), 'staff');
end;
$$;

-- 2. Applying. Answers are kept in details, limited to the questions the permit declares.
create or replace function private.builder_details(p_type public.application_types, p_details jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_field jsonb;
  v_value text;
begin
  for v_field in select * from jsonb_array_elements(p_type.fields) loop
    v_value := left(btrim(coalesce(p_details ->> (v_field ->> 'key'), '')),
      case when v_field ->> 'kind' = 'long' then 1000 else 200 end);
    if v_field ->> 'kind' = 'choice' and v_value <> ''
      and not exists (select 1 from jsonb_array_elements_text(v_field -> 'choices') c where c = v_value) then
      raise exception 'bad_choice';
    end if;
    v_out := v_out || jsonb_build_object(v_field ->> 'key', v_value);
  end loop;
  return v_out;
end;
$$;

create or replace function private.create_builder_draft(
  p_type_code text, p_details jsonb, p_attestation boolean, p_attestation_name text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  v := private.builder_type(p_type_code);
  if not v.active then raise exception 'not_found'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  insert into public.applications (applicant_id, application_type_id, status, attestation, attestation_name, details)
  values (auth.uid(), v.id, 'draft', coalesce(p_attestation, false),
    nullif(left(btrim(coalesce(p_attestation_name, '')), 200), ''), private.builder_details(v, coalesce(p_details, '{}'::jsonb)))
  returning id into v_id;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.ensure_steps(v_id);
  perform private.write_audit(v_id, 'draft_created', 'application', v_id, null, null, jsonb_build_object('status', 'draft'), 'citizen');
  return v_id;
end;
$$;

create or replace function private.save_builder_draft(
  p_application uuid, p_details jsonb, p_attestation boolean, p_attestation_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications;
  v public.application_types;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select * into v_app from public.applications where id = p_application and applicant_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if v_app.status <> 'draft' then raise exception 'application_locked'; end if;
  select * into v from public.application_types where id = v_app.application_type_id;
  if not v.builder then raise exception 'built_in_permit'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications
  set details = private.builder_details(v, coalesce(p_details, '{}'::jsonb)),
      attestation = coalesce(p_attestation, false),
      attestation_name = nullif(left(btrim(coalesce(p_attestation_name, '')), 200), '')
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
  v_type public.application_types;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  select * into v from public.applications where id = p_application and applicant_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  if v.status <> 'draft' then raise exception 'illegal_application_transition'; end if;
  select * into v_type from public.application_types where id = v.application_type_id;
  if v_type.builder then
    if not v_type.active then raise exception 'not_ready'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_type.fields) f
      where (f ->> 'required')::boolean and coalesce(btrim(v.details ->> (f ->> 'key')), '') = ''
    ) then
      raise exception 'not_ready';
    end if;
    if exists (
      select 1 from public.required_documents r
      where r.application_type_id = v_type.id and r.required
        and not exists (select 1 from public.documents d where d.application_id = p_application and d.kind = r.code)
    ) then
      raise exception 'not_ready';
    end if;
    if not v.attestation or coalesce(btrim(v.attestation_name), '') = '' then raise exception 'not_ready'; end if;
  elsif v_type.code = 'business_license_new' then
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

-- 3. The public face of each function.
create or replace function public.create_permit_type(p_name text, p_noun text, p_lead_agency_code text, p_summary text, p_source text)
returns text language sql set search_path = '' as $$ select private.create_permit_type(p_name, p_noun, p_lead_agency_code, p_summary, p_source) $$;
create or replace function public.add_type_step(p_type_code text, p_name text, p_agency_code text, p_routing text, p_note text)
returns text language sql set search_path = '' as $$ select private.add_type_step(p_type_code, p_name, p_agency_code, p_routing, p_note) $$;
create or replace function public.remove_type_step(p_type_code text, p_step_code text)
returns void language sql set search_path = '' as $$ select private.remove_type_step(p_type_code, p_step_code) $$;
create or replace function public.add_type_field(p_type_code text, p_label text, p_kind text, p_required boolean, p_help text, p_choices text[])
returns text language sql set search_path = '' as $$ select private.add_type_field(p_type_code, p_label, p_kind, p_required, p_help, p_choices) $$;
create or replace function public.remove_type_field(p_type_code text, p_key text)
returns void language sql set search_path = '' as $$ select private.remove_type_field(p_type_code, p_key) $$;
create or replace function public.add_type_document(p_type_code text, p_name text, p_notes text)
returns text language sql set search_path = '' as $$ select private.add_type_document(p_type_code, p_name, p_notes) $$;
create or replace function public.remove_type_document(p_type_code text, p_code text)
returns void language sql set search_path = '' as $$ select private.remove_type_document(p_type_code, p_code) $$;
create or replace function public.set_type_active(p_type_code text, p_active boolean)
returns void language sql set search_path = '' as $$ select private.set_type_active(p_type_code, p_active) $$;
create or replace function public.create_builder_draft(p_type_code text, p_details jsonb, p_attestation boolean, p_attestation_name text)
returns uuid language sql set search_path = '' as $$ select private.create_builder_draft(p_type_code, p_details, p_attestation, p_attestation_name) $$;
create or replace function public.save_builder_draft(p_application_id uuid, p_details jsonb, p_attestation boolean, p_attestation_name text)
returns void language sql set search_path = '' as $$ select private.save_builder_draft(p_application_id, p_details, p_attestation, p_attestation_name) $$;

revoke all on function
  public.create_permit_type(text, text, text, text, text), public.add_type_step(text, text, text, text, text),
  public.remove_type_step(text, text), public.add_type_field(text, text, text, boolean, text, text[]),
  public.remove_type_field(text, text), public.add_type_document(text, text, text), public.remove_type_document(text, text),
  public.set_type_active(text, boolean), public.create_builder_draft(text, jsonb, boolean, text),
  public.save_builder_draft(uuid, jsonb, boolean, text)
from public, anon;
revoke all on function
  private.create_permit_type(text, text, text, text, text), private.add_type_step(text, text, text, text, text),
  private.remove_type_step(text, text), private.add_type_field(text, text, text, boolean, text, text[]),
  private.remove_type_field(text, text), private.add_type_document(text, text, text), private.remove_type_document(text, text),
  private.set_type_active(text, boolean), private.create_builder_draft(text, jsonb, boolean, text),
  private.save_builder_draft(uuid, jsonb, boolean, text), private.builder_details(public.application_types, jsonb),
  private.builder_type(text), private.require_super(), private.slug(text), private.check_document_kind()
from public, anon, authenticated;
grant execute on function
  public.create_permit_type(text, text, text, text, text), public.add_type_step(text, text, text, text, text),
  public.remove_type_step(text, text), public.add_type_field(text, text, text, boolean, text, text[]),
  public.remove_type_field(text, text), public.add_type_document(text, text, text), public.remove_type_document(text, text),
  public.set_type_active(text, boolean), public.create_builder_draft(text, jsonb, boolean, text),
  public.save_builder_draft(uuid, jsonb, boolean, text),
  private.create_permit_type(text, text, text, text, text), private.add_type_step(text, text, text, text, text),
  private.remove_type_step(text, text), private.add_type_field(text, text, text, boolean, text, text[]),
  private.remove_type_field(text, text), private.add_type_document(text, text, text), private.remove_type_document(text, text),
  private.set_type_active(text, boolean), private.create_builder_draft(text, jsonb, boolean, text),
  private.save_builder_draft(uuid, jsonb, boolean, text)
to authenticated;
