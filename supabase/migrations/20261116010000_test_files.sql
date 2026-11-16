-- Test files must not shape the time estimates. A file walked through in seconds
-- by a tester would tell every real applicant that each step takes under an hour.

alter table public.applications add column if not exists is_test boolean not null default false;
grant select (is_test) on public.applications to authenticated;

create or replace function private.step_estimates(p_min_samples integer)
returns table (code text, samples integer, median_seconds bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select w.code, count(*)::integer, round(percentile_cont(0.5) within group (
    order by extract(epoch from (s.decided_at - s.started_at))
  ))::bigint
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  join public.applications a on a.id = s.application_id
  where s.status = 'approved'
    and not a.is_test
    and s.started_at is not null
    and s.decided_at is not null
    and s.decided_at >= s.started_at
  group by w.code
  having count(*) >= greatest(p_min_samples, 3)
$$;

-- Only a super admin who passed the second factor can mark or unmark a test file.
create or replace function private.set_test_file(p_application uuid, p_is_test boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  if not exists (select 1 from public.applications where id = p_application) then raise exception 'not_found'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set is_test = coalesce(p_is_test, false) where id = p_application;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(p_application, 'mark_test', 'application', p_application, null,
    null, jsonb_build_object('is_test', coalesce(p_is_test, false)), 'staff');
end;
$$;

create or replace function public.set_test_file(p_application_id uuid, p_is_test boolean)
returns void
language sql
set search_path = ''
as $$ select private.set_test_file(p_application_id, p_is_test) $$;

revoke all on function public.set_test_file(uuid, boolean) from public, anon;
revoke all on function private.set_test_file(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_test_file(uuid, boolean) to authenticated;
grant execute on function private.set_test_file(uuid, boolean) to authenticated;
