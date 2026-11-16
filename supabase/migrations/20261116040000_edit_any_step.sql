-- The admin step editor used to reach only the house permit. This one edits a step on
-- any tracked permit: when it applies, and the note the applicant reads.

create or replace function private.update_type_step(p_type_code text, p_step_code text, p_routing text, p_uncertainty text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.workflow_steps;
  v_house boolean := p_type_code = 'building_permit_residential_one_family';
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  select w.* into v from public.workflow_steps w
  join public.application_types t on t.id = w.application_type_id
  where t.code = p_type_code and w.code = p_step_code;
  if not found then raise exception 'not_found'; end if;
  if char_length(coalesce(p_uncertainty, '')) > 600 then raise exception 'too_long'; end if;
  if p_routing is distinct from v.routing then
    -- Intake, fee, and issue steps run on every file. Only review steps can be made optional.
    if v.phase in ('intake', 'fees', 'issuance', 'occupancy') then raise exception 'fixed_step'; end if;
    if v_house and p_routing not in ('always', 'default_routed', 'as_indicated', 'gated', 'provisional') then raise exception 'bad_routing'; end if;
    if not v_house and p_routing not in ('always', 'default_routed', 'as_indicated') then raise exception 'bad_routing'; end if;
  end if;
  update public.workflow_steps set routing = p_routing, uncertainty = nullif(btrim(coalesce(p_uncertainty, '')), '') where id = v.id;
  perform private.write_audit(null, 'update_workflow_step', 'workflow_step', v.id, p_uncertainty,
    jsonb_build_object('routing', v.routing), jsonb_build_object('routing', p_routing, 'permit', p_type_code), 'staff');
end;
$$;

create or replace function public.update_type_step(p_type_code text, p_step_code text, p_routing text, p_uncertainty text)
returns void language sql set search_path = '' as $$ select private.update_type_step(p_type_code, p_step_code, p_routing, p_uncertainty) $$;
revoke all on function public.update_type_step(text, text, text, text) from public, anon;
revoke all on function private.update_type_step(text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_type_step(text, text, text, text), private.update_type_step(text, text, text, text) to authenticated;
