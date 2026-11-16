-- Sample files. A demo needs finished files before any estimate can show, and no real
-- file exists yet. A sample file runs through the same functions as a real one and is
-- marked, so every page can say that it, and any estimate built from it, is not real.
-- The files themselves are created by supabase/seeds/sample_files.sql.

alter table public.applications add column if not exists is_sample boolean not null default false;
grant select (is_sample) on public.applications to authenticated;

-- Estimates count sample files, and say how many of the files behind each one are samples.
drop function if exists public.step_estimates_for(text, integer);
drop function if exists private.step_estimates_for(text, integer);

create function private.step_estimates_for(p_type_code text, p_min_samples integer)
returns table (code text, samples integer, median_seconds bigint, sample_files integer)
language sql
stable
security definer
set search_path = ''
as $$
  select w.code, count(*)::integer, round(percentile_cont(0.5) within group (
    order by extract(epoch from (s.decided_at - s.started_at))
  ))::bigint, (count(*) filter (where a.is_sample))::integer
  from public.application_steps s
  join public.workflow_steps w on w.id = s.workflow_step_id
  join public.application_types t on t.id = w.application_type_id
  join public.applications a on a.id = s.application_id
  where t.code = p_type_code
    and s.status = 'approved'
    and not a.is_test
    and s.started_at is not null
    and s.decided_at is not null
    and s.decided_at >= s.started_at
  group by w.code
  having count(*) >= greatest(coalesce(p_min_samples, 3), 3)
$$;

create function public.step_estimates_for(p_type_code text, p_min_samples integer default 3)
returns table (code text, samples integer, median_seconds bigint, sample_files integer)
language sql stable set search_path = '' as $$ select * from private.step_estimates_for(p_type_code, p_min_samples) $$;
revoke all on function public.step_estimates_for(text, integer) from public, anon;
revoke all on function private.step_estimates_for(text, integer) from public, anon, authenticated;
grant execute on function public.step_estimates_for(text, integer), private.step_estimates_for(text, integer) to authenticated;

-- A super admin can clear every sample file at once, when real files take over.
-- The audit log is append-only, so the files are withdrawn from estimates, not erased:
-- they become test files, which estimates ignore.
create or replace function private.retire_sample_files()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform private.require_staff();
  if not private.is_super_admin() then raise exception 'not_authorized'; end if;
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications set is_test = true where is_sample and not is_test;
  get diagnostics v_count = row_count;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(null, 'retire_sample_files', 'application', null, null, null, jsonb_build_object('files', v_count), 'staff');
  return v_count;
end;
$$;

create or replace function public.retire_sample_files()
returns integer language sql set search_path = '' as $$ select private.retire_sample_files() $$;
revoke all on function public.retire_sample_files() from public, anon;
revoke all on function private.retire_sample_files() from public, anon, authenticated;
grant execute on function public.retire_sample_files(), private.retire_sample_files() to authenticated;
