-- Catalog, verbose audit, assignment, and catalog-driven required documents.
-- Demo people stay out of this file. The seed password is not stored in git.

alter table public.agencies add column if not exists group_name text;
alter table public.agencies add column if not exists notes text;

alter table public.audit_log add column if not exists actor_role text;
alter table public.audit_log add column if not exists ip text;
alter table public.audit_log add column if not exists user_agent text;

alter table public.documents drop constraint if exists documents_kind_check;

create table if not exists public.permit_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  group_name text not null,
  agency_label text not null,
  agency_code text,
  source text,
  unverified boolean not null default false,
  trackable boolean not null default false,
  application_type_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.required_documents (
  id uuid primary key default gen_random_uuid(),
  application_type_id uuid not null references public.application_types (id) on delete cascade,
  code text not null,
  name text not null,
  required boolean not null default true,
  notes text,
  unique (application_type_id, code)
);

alter table public.permit_catalog enable row level security;
alter table public.permit_catalog force row level security;
alter table public.required_documents enable row level security;
alter table public.required_documents force row level security;

revoke all on public.permit_catalog, public.required_documents from public, anon, authenticated;
grant select on public.permit_catalog, public.required_documents to anon, authenticated;

drop policy if exists permit_catalog_read on public.permit_catalog;
create policy permit_catalog_read on public.permit_catalog for select to anon, authenticated using (true);
drop policy if exists required_documents_read on public.required_documents;
create policy required_documents_read on public.required_documents for select to anon, authenticated using (true);

drop function if exists private.write_audit(uuid, text, text, uuid, text, jsonb, jsonb, text);

create function private.write_audit(
  p_application uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_memo text,
  p_before jsonb,
  p_after jsonb,
  p_visibility text,
  p_ip text default null,
  p_user_agent text default null,
  p_actor_role text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(nullif(btrim(p_actor_role), ''), (
    select m.role from public.memberships m
    where m.user_id = auth.uid() and m.role <> 'citizen'
    order by case m.role when 'super_admin' then 0 when 'agency_admin' then 1 else 2 end
    limit 1
  ), case when auth.uid() is null then 'system' else 'citizen' end);
  perform set_config('permitgu.trusted_audit', '1', true);
  insert into public.audit_log (
    application_id, actor_id, action, entity, entity_id, memo, before, after, visibility, actor_role, ip, user_agent
  ) values (
    p_application, auth.uid(), p_action, p_entity, p_entity_id, nullif(btrim(p_memo), ''),
    p_before, p_after, p_visibility, v_role, nullif(btrim(p_ip), ''), nullif(btrim(p_user_agent), '')
  );
  perform set_config('permitgu.trusted_audit', '', true);
end;
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
    or exists (
      select 1
      from public.application_steps s
      join public.applications a on a.id = s.application_id
      where s.application_id = p_application
        and s.assignee_id = auth.uid()
        and a.status <> 'draft'
    )
  );
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
  if exists (
    select 1 from public.required_documents rd
    where rd.application_type_id = v.application_type_id
      and rd.required
      and not exists (
        select 1 from public.documents d
        where d.application_id = p_application and d.kind = rd.code
      )
  ) then
    raise exception 'not_ready';
  end if;
  perform private.ensure_steps(p_application);
  perform private.set_app_status(p_application, 'submitted', 'Application submitted in this unofficial tracker.', 'submit');
  perform private.queue_phase(p_application, 'intake', array['always', 'default_routed']);
end;
$$;

create or replace function private.record_event(
  p_application uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_memo text,
  p_ip text,
  p_user_agent text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  if p_action not in (
    'view_application', 'download_document', 'upload_document', 'sign_in', 'sign_out', 'comment'
  ) then
    raise exception 'bad_action';
  end if;
  if p_action in ('sign_in', 'sign_out') then
    perform private.write_audit(null, p_action, 'session', auth.uid(), p_memo, null, null, 'citizen', p_ip, p_user_agent, null);
    return;
  end if;
  if p_application is null or not private.can_view_application(p_application) then
    raise exception 'not_found';
  end if;
  perform private.write_audit(p_application, p_action, p_entity, p_entity_id, p_memo, null, null, 'citizen', p_ip, p_user_agent, null);
end;
$$;

create or replace function private.assign_step(p_step_id uuid, p_assignee uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step public.application_steps;
  v_previous uuid;
begin
  perform private.require_staff();
  if not private.memo_ok(p_memo) then raise exception 'memo_required'; end if;
  select * into v_step from public.application_steps where id = p_step_id;
  if not found then raise exception 'not_found'; end if;
  if not (private.is_super_admin() or private.is_agency_admin(v_step.agency_id) or private.is_lead_staff(v_step.application_id)) then
    raise exception 'not_authorized';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.memberships
    where user_id = p_assignee and agency_id = v_step.agency_id and role in ('reviewer', 'agency_admin')
  ) and not private.is_super_admin() then
    raise exception 'wrong_agency';
  end if;
  v_previous := v_step.assignee_id;
  update public.application_steps set assignee_id = p_assignee, updated_at = now() where id = p_step_id;
  perform private.write_audit(
    v_step.application_id, 'assign_step', 'application_step', p_step_id, p_memo,
    jsonb_build_object('assignee_id', v_previous), jsonb_build_object('assignee_id', p_assignee), 'staff',
    null, null, null
  );
end;
$$;

create or replace function private.add_permit_catalog(
  p_name text,
  p_group_name text,
  p_agency_label text,
  p_agency_code text,
  p_source text,
  p_unverified boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_group_name), '') = '' then raise exception 'not_ready'; end if;
  v_code := left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 80);
  insert into public.permit_catalog (code, name, group_name, agency_label, agency_code, source, unverified, trackable)
  values (v_code, btrim(p_name), btrim(p_group_name), coalesce(nullif(btrim(p_agency_label), ''), 'Unassigned'), nullif(btrim(p_agency_code), ''), nullif(btrim(p_source), ''), coalesce(p_unverified, true), false);
  perform private.write_audit(null, 'add_permit_catalog', 'permit_catalog', null, p_name, null, jsonb_build_object('code', v_code), 'staff');
  return v_code;
end;
$$;

create or replace function private.add_required_document(
  p_application_type_code text,
  p_code text,
  p_name text,
  p_required boolean,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type uuid;
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  select id into v_type from public.application_types where code = p_application_type_code;
  if v_type is null then raise exception 'not_found'; end if;
  if coalesce(btrim(p_code), '') = '' or coalesce(btrim(p_name), '') = '' then raise exception 'not_ready'; end if;
  insert into public.required_documents (application_type_id, code, name, required, notes)
  values (v_type, btrim(p_code), btrim(p_name), coalesce(p_required, true), nullif(btrim(p_notes), ''))
  on conflict (application_type_id, code) do update
    set name = excluded.name, required = excluded.required, notes = excluded.notes;
  perform private.write_audit(null, 'add_required_document', 'required_document', v_type, p_notes, null,
    jsonb_build_object('code', p_code, 'required', coalesce(p_required, true)), 'staff');
end;
$$;

create or replace function public.record_event(
  p_application_id uuid, p_action text, p_entity text, p_entity_id uuid, p_memo text, p_ip text, p_user_agent text
) returns void language sql security invoker set search_path = public, private as $$
  select private.record_event(p_application_id, p_action, p_entity, p_entity_id, p_memo, p_ip, p_user_agent);
$$;

create or replace function public.assign_step(p_step_id uuid, p_assignee uuid, p_memo text)
returns void language sql security invoker set search_path = public, private as $$
  select private.assign_step(p_step_id, p_assignee, p_memo);
$$;

create or replace function public.add_permit_catalog(
  p_name text, p_group_name text, p_agency_label text, p_agency_code text, p_source text, p_unverified boolean
) returns text language sql security invoker set search_path = public, private as $$
  select private.add_permit_catalog(p_name, p_group_name, p_agency_label, p_agency_code, p_source, p_unverified);
$$;

create or replace function public.add_required_document(
  p_application_type_code text, p_code text, p_name text, p_required boolean, p_notes text
) returns void language sql security invoker set search_path = public, private as $$
  select private.add_required_document(p_application_type_code, p_code, p_name, p_required, p_notes);
$$;

drop policy if exists profiles_staff_directory on public.profiles;
create policy profiles_staff_directory on public.profiles for select to authenticated
using (
  private.aal() = 'aal2'
  and (
    private.is_super_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.id and private.is_agency_admin(m.agency_id)
    )
  )
);

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
using (
  (visibility = 'citizen' and application_id is not null and private.owns_application(application_id))
  or (actor_id = (select auth.uid()) and action in ('sign_in', 'sign_out'))
  or (private.aal() = 'aal2' and private.is_super_admin())
  or (
    private.aal() = 'aal2'
    and application_id is not null
    and private.can_staff_view_application(application_id)
  )
);

revoke all on function
  public.record_event(uuid, text, text, uuid, text, text, text),
  public.assign_step(uuid, uuid, text),
  public.add_permit_catalog(text, text, text, text, text, boolean),
  public.add_required_document(text, text, text, boolean, text)
from public, anon;
grant execute on function
  public.record_event(uuid, text, text, uuid, text, text, text),
  public.assign_step(uuid, uuid, text),
  public.add_permit_catalog(text, text, text, text, text, boolean),
  public.add_required_document(text, text, text, boolean, text)
to authenticated;
grant execute on function
  private.record_event(uuid, text, text, uuid, text, text, text),
  private.assign_step(uuid, uuid, text),
  private.add_permit_catalog(text, text, text, text, text, boolean),
  private.add_required_document(text, text, text, boolean, text)
to authenticated;
-- Generated by tools/emit_catalog.mjs from docs/sources. Do not edit by hand.
insert into public.agencies (code, name, acronym, website, group_name, notes) values
  ('count', 'Source', 'Count', null, 'What "~51 agencies" refers to', null),
  ('58numberedrows', 'DOA/HR 2023 Department/Agency Listing (GHI RFP attachment)', '58 numbered rows', null, 'What "~51 agencies" refers to', '[PDF](https://hr.doa.guam.gov/wp-hr-content/uploads/2023/05/FY2024-GHI-RFP-Amendment-III-Attachment-Department-Listing.pdf)'),
  ('70listings', 'Guam Legislature GovGuam Web Directory', '~70 listings', null, 'What "~51 agencies" refers to', '[Directory](https://guamlegislature.gov/govguam-web-directory/)'),
  ('overlapslegislaturelist', 'DOA Official Portal Directory', 'Overlaps Legislature list', null, 'What "~51 agencies" refers to', '[doa.guam.gov/official-portal-directory](https://doa.guam.gov/official-portal-directory/)'),
  ('statutorychapters', '12 GCA Title 12 (Autonomous Agencies)', 'Statutory chapters', null, 'What "~51 agencies" refers to', '[Justia Title 12 Div. 1](https://law.justia.com/codes/guam/2024/title-12/division-1/)'),
  ('bbmr', 'Bureau of Budget & Management Research', 'BBMR', 'https://bbmr.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('bsp', 'Bureau of Statistics and Plans', 'BSP', 'https://bsp.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('bwa', 'Bureau of Women''s Affairs', 'BWA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('cltc', 'Chamorro Land Trust Commission', 'CLTC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('cme', 'Office of the Chief Medical Examiner', 'CME', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('csc', 'Civil Service Commission', 'CSC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('caha', 'Council on the Arts & Humanities Agency', 'CAHA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('cqa', 'Customs and Quarantine Agency', 'CQA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('doa', 'Department of Administration', 'DOA', 'https://doa.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('doag', 'Department of Agriculture', 'DoAg / AGR', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dca', 'Department of Chamorro Affairs', 'DCA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('doc', 'Department of Corrections', 'DOC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('disid', 'Department of Integrated Services for Individuals with Disabilities', 'DISID', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dol', 'Department of Labor', 'DOL / AHRD', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dlm', 'Department of Land Management', 'DLM', 'https://dlm.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dma', 'Department of Military Affairs', 'DMA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dpr', 'Department of Parks and Recreation', 'DPR', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dphss', 'Department of Public Health & Social Services', 'DPHSS', 'https://dphss.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dpw', 'Department of Public Works', 'DPW', 'https://dpw.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('drt', 'Department of Revenue & Taxation', 'DRT', 'https://www.guamtax.com/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('dya', 'Department of Youth Affairs', 'DYA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('governmentethicscommission', 'Government Ethics Commission', '(Ethics)', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gbhwc', 'Guam Behavioral Health and Wellness Center', 'GBHWC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gcec', 'Guam Commission for Educator Certification', 'GCEC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('getc', 'Guam Educational Telecommunication Corporation (KGTF)', 'GETC / KGTF', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gec', 'Guam Election Commission', 'GEC', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('geo', 'Guam Energy Office', 'GEO', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gepa', 'Guam Environmental Protection Agency', 'GEPA / Guam EPA', 'https://epa.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gfd', 'Guam Fire Department', 'GFD', 'https://gfd.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('ghs', 'Guam Homeland Security / Office of Civil Defense', 'GHS / OCD', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gpd', 'Guam Police Department', 'GPD', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gpls', 'Guam Public Library System', 'GPLS', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('grta', 'Guam Regional Transit Authority', 'GRTA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gswa', 'Guam Solid Waste Authority', 'GSWA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('vao', 'Guam Veterans Affairs Office', 'VAO', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('hrra', 'Hagåtña Restoration & Redevelopment Authority', 'HRRA', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('ltgov', 'Office of the Lieutenant Governor', 'LtGov', 'https://governor.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('mcog', 'Mayors'' Council of Guam', 'MCOG', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('otech', 'Office of Technology', 'OTECH', null, 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('gov', 'Office of the Governor', 'Gov', 'https://governor.guam.gov/', 'A. Line departments & non-autonomous agencies (DOA listing #1–40)', null),
  ('governmentofguamretirementfund', '41–42', 'Government of Guam Retirement Fund (retiree/survivor + staff rows)', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', 'listed on directories'),
  ('gcc', 'Guam Community College', 'GCC', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('gdoe', 'Guam Department of Education', 'GDOE', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('geda', 'Guam Economic Development Authority', 'GEDA', 'https://www.investguam.com/', 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('ghura', 'Guam Housing and Urban Renewal Authority', 'GHURA', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('ghc', 'Guam Housing Corporation', 'GHC', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('giaa', 'A.B. Won Pat International Airport Authority / GIAA', 'GIAA / Airport', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('legislature', 'Guam Legislature (I Liheslaturan Guåhan)', 'Legislature', 'https://guamlegislature.gov/', 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('gmha', 'Guam Memorial Hospital Authority', 'GMHA', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('gpa', 'Guam Power Authority', 'GPA', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('gvb', 'Guam Visitors Bureau', 'GVB', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('gwa', 'Guam Waterworks Authority', 'GWA', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('oag', 'Office of the Attorney General', 'OAG', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('opa', 'Office of the Public Auditor', 'OPA', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('pag', 'Port Authority of Guam', 'PAG', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('pdsc', 'Public Defender Service Corporation', 'PDSC', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('uog', 'University of Guam', 'UOG', null, 'B. Autonomous / semi-autonomous agencies & public corporations (DOA listing #41–58)', null),
  ('judiciary', 'Judiciary of Guam', 'Judiciary', null, 'C. Legislative & judicial branches (and related)', 'Courts; Board of Law Examiners for attorney admission'),
  ('districtcourtofguamfederal', 'District Court of Guam (federal)', '—', null, 'C. Legislative & judicial branches (and related)', 'Federal, not GovGuam; listed in older Protocol Directory'),
  ('officeofthedelegatecongressmanmo', 'Office of the Delegate (Congressman Moylan)', '—', null, 'C. Legislative & judicial branches (and related)', 'Federal delegate — not a GovGuam agency'),
  ('gluc', 'Guam Land Use Commission', 'GLUC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Zone change, variance, conditional use, subdivisions'),
  ('gspc', 'Guam Seashore Protection Commission', 'GSPC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Seashore clearance'),
  ('arc', 'Application Review Committee', 'ARC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Technical review for GLUC'),
  ('galc', 'Guam Ancestral Lands Commission', 'GALC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Ancestral lands'),
  ('clb', 'Contractors License Board', 'CLB', 'https://clb.guam.gov/', 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Contractor licenses'),
  ('peals', 'PEALS Board (Engineers, Architects, Land Surveyors)', 'PEALS', 'https://peals.guam.gov/', 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'PE / architect / surveyor registration'),
  ('gboa', 'Guam Board of Accountancy', 'GBOA', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'CPA / accountancy'),
  ('abcboard', 'Alcoholic Beverage Control Board', 'ABC Board', 'https://www.guamtax.com/abc/', 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Liquor licenses (via DRT)'),
  ('guamrealestatecommission', 'Guam Real Estate Commission', '—', 'https://guamrealestatecommission.com/', 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Real estate licenses'),
  ('commissionondecolonizationselfde', 'Commission on Decolonization / Self-Determination', '—', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Policy commission'),
  ('kumisionifinochamoru', 'Kumision i Fino'' CHamoru', '—', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'CHamoru language'),
  ('gddc', 'Guam Developmental Disabilities Council', 'GDDC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Council'),
  ('gpuc', 'Guam Public Utilities Commission', 'GPUC / PUC', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Utility regulation'),
  ('gpt', 'Guam Preservation Trust', 'GPT', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Historic preservation funding / related'),
  ('ghpo', 'Historic Preservation Office (under DPR / statute)', 'GHPO', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Certificate of approval for building permits'),
  ('hplo', 'Health Professional Licensing Office boards (under DPHSS/HPLO)', 'HPLO', 'https://dphss.guam.gov/services/hplo', 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Physicians, nurses, pharmacy, dentistry, optometry, allied health, barbering/cosmetology, EMS, social work'),
  ('guamstateclearinghouse', 'Guam State Clearinghouse', '—', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Federal consistency routing'),
  ('gmro', 'Guam Medical Referral Office', 'GMRO', null, 'E. Boards, commissions & permit-issuing bodies (beyond DOA numbered list)', 'Medical referral'),
  ('tog', 'Treasurer of Guam (under DOA)', 'TOG', 'https://doa.guam.gov/', 'F. Utilities & authorities citizens interact with for clearances', null),
  ('approxcount', 'Group', 'Approx. count', null, 'Recommended totals (how to cite them)', null),
  ('40', 'Line / non-autonomous (DOA 1–40)', '40', null, 'Recommended totals (how to cite them)', null),
  ('18rows', 'Autonomous / public corp rows (DOA 41–58)', '18 rows / 17 unique', null, 'Recommended totals (how to cite them)', null),
  ('57', 'DOA total unique', '~57', null, 'Recommended totals (how to cite them)', null),
  ('20', 'Boards & commissions (extra)', '~20+', null, 'Recommended totals (how to cite them)', null),
  ('1', 'Mayors'' Council (already in DOA)', '1', null, 'Recommended totals (how to cite them)', null)
on conflict (code) do update set group_name = coalesce(public.agencies.group_name, excluded.group_name), notes = coalesce(public.agencies.notes, excluded.notes);

insert into public.permit_catalog (code, name, group_name, agency_label, agency_code, source, unverified, trackable, application_type_code) values
  ('application-for-permit-and-plan-review-building-permit', 'Application for Permit and Plan Review (building permit)', '1. Build / renovate a home', 'DPW Building Inspection & Permits / BLPC', 'dpw', 'https://bsp.guam.gov/wp-content/uploads/2026/08/DPW-Application-for-Permit-and-Plan-Review-Fillable.pdf', false, true, 'building_permit_residential_one_family'),
  ('clearing-grading-stockpiling-permit-often-with-gepa', 'Clearing / grading / stockpiling permit (often with GEPA)', '1. Build / renovate a home', 'DPW + GEPA', 'dpw', 'https://epa.guam.gov/applications/ ; BSP Guidebook https://bsp.guam.gov/guam-development-guidebook/', false, false, null),
  ('certificate-of-occupancy', 'Certificate of occupancy', '1. Build / renovate a home', 'DPW', 'dpw', '21 GCA Ch. 66 (via Building Law); process described in BSP Guidebook', false, false, null),
  ('zoning-examination-certification', 'Zoning examination / certification', '1. Build / renovate a home', 'DLM', 'dlm', 'https://dlm.guam.gov/ ; DPW application §VI', false, false, null),
  ('historic-preservation-certificate-of-approval', 'Historic Preservation certificate of approval', '1. Build / renovate a home', 'Guam Historic Preservation Officer', null, 'https://www.territorialreview.org/statute/21-gca-76511', false, false, null),
  ('gwa-water-sewer-availability-connection-clearance', 'GWA water/sewer availability / connection clearance', '1. Build / renovate a home', 'GWA', 'gwa', 'Listed on DPW application & GEPA Form A http://epa.guam.gov/wp-content/uploads/2026/08/FORM-A-Guam-EPA-Building-Permit-Application.pdf', false, false, null),
  ('gpa-power-clearance', 'GPA power clearance', '1. Build / renovate a home', 'GPA', 'gpa', 'Listed on DPW application regulatory agencies section', false, false, null),
  ('gepa-building-permit-wastewater-anods-review', 'GEPA building-permit / wastewater / ANODS review', '1. Build / renovate a home', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/ ; Form A above', false, false, null),
  ('dphss-public-health-clearance-as-routed', 'DPHSS Public Health clearance (as routed)', '1. Build / renovate a home', 'DPHSS', 'dphss', 'Listed on DPW application', false, false, null),
  ('fire-prevention-bureau-plan-check-clearance', 'Fire Prevention Bureau plan check / clearance', '1. Build / renovate a home', 'GFD', 'gfd', 'https://gfd.guam.gov/forms/ ; DPW application', false, false, null),
  ('contractor-s-license-board-clearance-as-routed', 'Contractor''s License Board clearance (as routed)', '1. Build / renovate a home', 'CLB', 'clb', 'https://clb.guam.gov/ ; DPW application', false, false, null),
  ('peals-stamp-registration-plans-by-pe-architect', 'PEALS stamp / registration (plans by PE/architect)', '1. Build / renovate a home', 'PEALS', 'peals', 'https://peals.guam.gov/', false, false, null),
  ('flood-elevation-flood-control-review-if-in-flood-zone', 'Flood elevation / flood-control review (if in flood zone)', '1. Build / renovate a home', 'DPW (+ related)', 'dpw', 'DPW application plan-review fields', false, false, null),
  ('wetland-seashore-gluc-special-path-if-applicable', 'Wetland / seashore / GLUC special path (if applicable)', '1. Build / renovate a home', 'DLM / GLUC / GSPC / USACE', 'dlm', 'DLM forms https://dlm.guam.gov/applications-and-forms/ ; BSP Guidebook', false, false, null),
  ('new-business-license-form-bl-01', 'New business license (Form BL-01)', '2. Start / run a business', 'DRT General Licensing / BLPC', 'drt', 'https://www.govguamdocs.com/revtax/docs/PROCEDURESANDREQUIREMENTSFORNEWBL.pdf ; https://www.govguamdocs.com/revtax/docs/FormBL-01InstructionswithApplicationandQuestionnaire11192020.pdf', false, false, null),
  ('good-moral-character-questionnaire', 'Good Moral Character Questionnaire', '2. Start / run a business', 'DRT', 'drt', 'Same BL-01 PDF', false, false, null),
  ('dba-fictitious-name-certificate', 'DBA / fictitious name certificate', '2. Start / run a business', 'DRT', 'drt', 'https://bsp.guam.gov/blpc/ (DRT forms list)', false, false, null),
  ('entity-registration-corp-llc-lp-nonprofit-foreign', 'Entity registration (corp, LLC, LP, nonprofit, foreign)', '2. Start / run a business', 'DRT', 'drt', 'https://bsp.guam.gov/blpc/ ; https://www.investguam.com/establishing-a-business-in-guam/', false, false, null),
  ('name-reservation', 'Name reservation', '2. Start / run a business', 'DRT', 'drt', 'BSP BLPC DRT forms', false, false, null),
  ('business-license-renewal-amendment-relocation-cancellation', 'Business license renewal / amendment / relocation / cancellation', '2. Start / run a business', 'DRT', 'drt', 'BSP BLPC DRT forms', false, false, null),
  ('tobacco-products-license', 'Tobacco products license', '2. Start / run a business', 'DRT', 'drt', 'BSP BLPC DRT forms', false, false, null),
  ('martial-arts-registration', 'Martial arts registration', '2. Start / run a business', 'DRT', 'drt', 'BSP BLPC DRT forms', false, false, null),
  ('guam-trademark-service-mark', 'Guam trademark / service mark', '2. Start / run a business', 'DRT', 'drt', 'BSP BLPC DRT forms', false, false, null),
  ('agency-clearances-on-bl-01-activity-specific-dlm-gvb-dpw-dpr-gfd-dphss-clb-gpd-c', 'Agency clearances on BL-01 (activity-specific): DLM, GVB, DPW, DPR, GFD, DPHSS, CLB, GPD, Collections, GRT, etc.', '2. Start / run a business', 'Multiple', null, 'BL-01 form checklist (routing matrix unverified per activity)', true, false, null),
  ('sanitary-permit-form-a-new-establishment', 'Sanitary Permit (Form A) — new establishment', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/sanitary-permits ; https://dphss.guam.gov/forms', false, false, null),
  ('supplemental-form-b-food-establishment', 'Supplemental Form B — food establishment', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('sanitary-permit-renewal', 'Sanitary Permit renewal', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('temporary-food-service-establishment-tfse-sanitary-permit', 'Temporary Food Service Establishment (TFSE) sanitary permit', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms ; https://bsp.guam.gov/blpc/', false, false, null),
  ('temporary-workforce-housing-sanitary-dormitory-permit', 'Temporary workforce housing sanitary / dormitory permit', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('chemical-toilet-sanitary-permit', 'Chemical toilet sanitary permit', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('health-certificate-food-facility', 'Health Certificate — food facility', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('health-certificate-cosmetology-tattoo-therapeutic-massage', 'Health Certificate — cosmetology / tattoo / therapeutic massage', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('health-certificate-institutional-child-care-nursing-home-etc', 'Health Certificate — institutional (child care, nursing home, etc.)', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('health-certificate-laundry-dry-cleaning', 'Health Certificate — laundry / dry cleaning', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('guam-controlled-substances-registration-individual-institutional', 'Guam Controlled Substances Registration (individual / institutional)', '3. Food / health establishments', 'DPHSS', 'dphss', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('pre-operational-inspection', 'Pre-operational inspection', '3. Food / health establishments', 'DPHSS DEH', 'dphss', 'Sanitary Permit Form A instructions PDF on dphss.guam.gov', false, false, null),
  ('learner-s-permit-intermediate-full-driver-s-license', 'Learner''s permit / intermediate / full driver''s license', '4. Driving / vehicles', 'DRT Motor Vehicle Division', 'drt', 'https://www.guamtax.com/about/mvd.html ; handbook https://www.govguamdocs.com/revtax/docs/GuamDRTDriversHandbook.pdf', false, false, null),
  ('real-id-guam-id', 'REAL ID / Guam ID', '4. Driving / vehicles', 'DRT MVD', 'drt', 'https://www.guamtax.com/help/realIDpolicy.html', false, false, null),
  ('vehicle-initial-registration-transfer', 'Vehicle initial registration / transfer', '4. Driving / vehicles', 'DRT Vehicle Registration Branch', 'drt', 'https://www.govguamdocs.com/revtax/docs/ApplicationforInitialRegistrationand_orTransfer(updated_10_29_2025).pdf', false, false, null),
  ('vehicle-registration-renewal', 'Vehicle registration renewal', '4. Driving / vehicles', 'DRT', 'drt', 'https://www.guamtax.com/efile/vehreg.html (MyGuamTax)', false, false, null),
  ('vehicle-safety-inspection-prerequisite', 'Vehicle safety inspection (prerequisite)', '4. Driving / vehicles', 'Authorized stations / DRT rules', 'drt', 'Drivers handbook PDF', false, false, null),
  ('disabled-parking-placard-veteran-plates', 'Disabled parking placard / veteran plates', '4. Driving / vehicles', 'DRT Vehicle Registration', 'drt', 'https://www.guamtax.com/about/mvd.html', false, false, null),
  ('motor-carrier-compliance-commercial', 'Motor carrier compliance (commercial)', '4. Driving / vehicles', 'DRT Motor Carrier Branch', 'drt', 'https://www.guamtax.com/about/mvd.html', false, false, null),
  ('certification-of-zoning', 'Certification of Zoning', '5. Land / property', 'DLM', 'dlm', 'Zoning Law / PermitGU zoning guide cites 21 GCA §61660; https://dlm.guam.gov/', false, false, null),
  ('zone-change-gluc-form-02', 'Zone change (GLUC Form 02)', '5. Land / property', 'GLUC / DLM', 'dlm', 'https://dlm.guam.gov/applications-and-forms/ ; https://bsp.guam.gov/blpc/', false, false, null),
  ('zone-variance-gluc-form-03', 'Zone variance (GLUC Form 03)', '5. Land / property', 'GLUC / DLM', 'dlm', 'Same', false, false, null),
  ('conditional-use-gluc-form-01', 'Conditional use (GLUC Form 01)', '5. Land / property', 'GLUC / DLM', 'dlm', 'Same', false, false, null),
  ('subdivision-variance-tentative-final-subdivision-forms-04-06', 'Subdivision variance / tentative / final subdivision (Forms 04–06)', '5. Land / property', 'GLUC / DLM', 'dlm', 'Same', false, false, null),
  ('tentative-development-plan-wetland-hpr-timeshare-forms-07-10', 'Tentative development plan / wetland / HPR / timeshare (Forms 07–10)', '5. Land / property', 'GLUC / DLM', 'dlm', 'Same', false, false, null),
  ('seashore-clearance-gspc-form-01', 'Seashore clearance (GSPC Form 01)', '5. Land / property', 'GSPC / DLM', 'dlm', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('landweb-parcel-title-survey-searches', 'LandWeb parcel / title / survey searches', '5. Land / property', 'DLM', 'dlm', 'Referenced on PermitGU zoning page; LandWeb access details partially unverified', true, false, null),
  ('certificate-of-title-recording', 'Certificate of title / recording', '5. Land / property', 'DLM', 'dlm', 'DLM services (verify exact form names with DLM)', false, false, null),
  ('real-property-tax-matters', 'Real property tax matters', '5. Land / property', 'DRT Real Property (also at BLPC)', 'drt', 'https://dpw.guam.gov/blpc/ ; guamtax.com', false, false, null),
  ('chamorro-land-trust-ancestral-lands-actions', 'Chamorro Land Trust / Ancestral Lands actions', '5. Land / property', 'CLTC / GALC', 'cltc', 'Directories; specific application set unverified this turn', true, false, null),
  ('clearing-grubbing-grading-stockpiling', 'Clearing, grubbing, grading, stockpiling', '6. Environment', 'GEPA (+ DPW path)', 'dpw', 'https://epa.guam.gov/applications/', false, false, null),
  ('soil-sand-aggregate-importation', 'Soil / sand / aggregate importation', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('section-401-water-quality-certification-401a-b-c', 'Section 401 Water Quality Certification (401A/B/C)', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('well-drilling-well-operating-uic-test-boring', 'Well drilling / well operating / UIC / test boring', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('well-driller-s-license-limited-unlimited', 'Well driller''s license (limited / unlimited)', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('residential-commercial-holding-tank-type-4-anods', 'Residential / commercial holding tank; Type 4 ANODS', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('air-pollution-construction-standby-generator-emission-unit', 'Air pollution construction / standby generator / emission unit', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('solid-waste-collection-hardfill-landfill-processing-storage-transfer', 'Solid waste collection / hardfill / landfill / processing / storage / transfer', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('ust-hazardous-waste-notification-rcra', 'UST / hazardous waste notification / RCRA', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('pesticide-notice-of-arrival-restricted-use-licenses-noi', 'Pesticide Notice of Arrival / restricted-use licenses / NOI', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('water-wastewater-operator-certification', 'Water & wastewater operator certification', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('burial-at-sea-request', 'Burial at sea request', '6. Environment', 'GEPA', 'gepa', 'https://epa.guam.gov/applications/', false, false, null),
  ('burning-permit', 'Burning permit', '6. Environment', 'GFD (issued by GFD; noted on GEPA page)', 'gepa', 'https://epa.guam.gov/applications/ ; https://gfd.guam.gov/forms/', false, false, null),
  ('federal-consistency-coastal-management', 'Federal consistency / coastal management', '6. Environment', 'BSP GCMP', 'bsp', 'https://bsp.guam.gov/guam-development-guidebook/', false, false, null),
  ('usace-wetlands-navigable-waters-federal', 'USACE wetlands / navigable waters (federal)', '6. Environment', 'USACE', 'usace', 'Noted on DPW application & BSP Guidebook', false, false, null),
  ('operations-permit', 'Operations Permit', '7. Fire / safety', 'GFD Fire Prevention Bureau', 'gfd', 'https://gfd.guam.gov/forms/ (Operations Permit Application)', false, false, null),
  ('gfd-permit-application-application-for-permit', 'GFD Permit Application / Application for Permit', '7. Fire / safety', 'GFD', 'gfd', 'https://gfd.guam.gov/forms/', false, false, null),
  ('fire-prevention-plan-review-building', 'Fire Prevention plan review (building)', '7. Fire / safety', 'GFD', 'gfd', 'DPW application; https://gfd.guam.gov/forms/', false, false, null),
  ('gfd-fee-schedule', 'GFD fee schedule', '7. Fire / safety', 'GFD', 'gfd', 'https://gfd.guam.gov/forms/ ; also listed on https://bsp.guam.gov/blpc/', false, false, null),
  ('self-inspection-form', 'Self-inspection form', '7. Fire / safety', 'GFD', 'gfd', 'https://gfd.guam.gov/forms/', false, false, null),
  ('contractor-s-license', 'Contractor''s license', '8. Professional licensing', 'CLB', 'clb', 'https://clb.guam.gov/', false, false, null),
  ('professional-engineer-architect-land-surveyor', 'Professional engineer / architect / land surveyor', '8. Professional licensing', 'PEALS', 'peals', 'https://peals.guam.gov/', false, false, null),
  ('cpa-accountancy', 'CPA / accountancy', '8. Professional licensing', 'Guam Board of Accountancy', 'count', 'Legislature / DOA directories', false, false, null),
  ('real-estate-broker-salesperson', 'Real estate broker / salesperson', '8. Professional licensing', 'Guam Real Estate Commission', null, 'https://guamrealestatecommission.com/', false, false, null),
  ('educator-certification', 'Educator certification', '8. Professional licensing', 'GCEC', 'gcec', 'Directories', false, false, null),
  ('physicians-board-of-medical-examiners', 'Physicians (Board of Medical Examiners)', '8. Professional licensing', 'DPHSS HPLO', 'dphss', 'https://dphss.guam.gov/services/hplo', false, false, null),
  ('nurses-board-of-nurse-examiners', 'Nurses (Board of Nurse Examiners)', '8. Professional licensing', 'DPHSS HPLO', 'dphss', 'Same', false, false, null),
  ('pharmacy-dentistry-optometry-allied-health-ems-social-work-barbering-cosmetology', 'Pharmacy / dentistry / optometry / allied health / EMS / social work / barbering & cosmetology boards', '8. Professional licensing', 'DPHSS HPLO', 'dphss', 'Same (nine boards listed)', false, false, null),
  ('attorney-admission', 'Attorney admission', '8. Professional licensing', 'Judiciary / Board of Law Examiners', 'judiciary', 'SIU professional licensure summary https://professionallicensure.siu.edu/guam.php (confirm current Judiciary page)', false, false, null),
  ('alcoholic-beverage-licenses-import-manufacture-on-off-sale-etc', 'Alcoholic beverage licenses (import, manufacture, on/off-sale, etc.)', '9. Events / alcohol / tobacco', 'DRT ABC Board', 'drt', 'https://www.guamtax.com/abc/ ; application PDFs under govguamdocs.com/revtax', false, false, null),
  ('fund-raising-event-application', 'Fund raising event application', '9. Events / alcohol / tobacco', 'DRT', 'drt', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('temporary-food-event-sanitary-permits', 'Temporary food / event sanitary permits', '9. Events / alcohol / tobacco', 'DPHSS', 'dphss', 'https://dphss.guam.gov/forms', false, false, null),
  ('village-mayor-mcog-event-clearances', 'Village mayor / MCOG event clearances', '9. Events / alcohol / tobacco', 'Mayors / MCOG', 'mcog', 'Unverified exact form set this turn', true, false, null),
  ('tobacco-products-license-87', 'Tobacco products license', '9. Events / alcohol / tobacco', 'DRT', 'drt', 'https://bsp.guam.gov/blpc/', false, false, null),
  ('birth-death-marriage-certificates', 'Birth / death / marriage certificates', '10. IDs / records / vital statistics', 'DPHSS Office of Vital Statistics', 'dphss', 'https://dphss.guam.gov/services/vital-statistics', false, false, null),
  ('driver-s-license-real-id-guam-id', 'Driver''s license / REAL ID / Guam ID', '10. IDs / records / vital statistics', 'DRT MVD', 'drt', 'https://www.guamtax.com/help/realIDpolicy.html', false, false, null),
  ('business-privilege-tax-accounts-grt', 'Business privilege / tax accounts (GRT)', '10. IDs / records / vital statistics', 'DRT', 'drt', 'guamtax.com (account setup details vary)', false, false, null),
  ('passport-u-s', 'Passport (U.S.)', '10. IDs / records / vital statistics', 'U.S. Department of State (federal)', null, 'Not GovGuam — listed only as related life-event', false, false, null),
  ('treasurer-of-guam-fee-payments-blpc-cashier', 'Treasurer of Guam fee payments (BLPC cashier)', '11. Other notable citizen/business approvals', 'TOG / DOA', 'tog', 'https://dpw.guam.gov/blpc/', false, false, null),
  ('guam-solid-waste-authority-service-related', 'Guam Solid Waste Authority service / related', '11. Other notable citizen/business approvals', 'GSWA', 'gswa', 'DOA listing; specific permit URLs unverified', true, false, null),
  ('customs-related-clearances', 'Customs-related clearances', '11. Other notable citizen/business approvals', 'CQA', 'cqa', 'Directories; detailed citizen DIY set unverified', true, false, null),
  ('police-clearances-as-required-on-some-licenses', 'Police clearances (as required on some licenses)', '11. Other notable citizen/business approvals', 'GPD', 'gpd', 'Referenced on BL-01 checklist', false, false, null)
on conflict (code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select id, 'plans', 'Building plans', true, 'The DPW application asks for plans. The building official may waive them for minor work. This flow is a new house.' from public.application_types where code = 'building_permit_residential_one_family'
union all
select id, 'plot_plan', 'Plot plan', true, 'Drawn from a boundary survey, as the building guide describes.' from public.application_types where code = 'building_permit_residential_one_family'
on conflict (application_type_id, code) do nothing;
