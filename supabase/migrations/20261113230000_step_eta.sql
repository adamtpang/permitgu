-- Step timing for the tracker ETA.
-- Each step records when an agency first held it and when it was decided.
-- Estimates are medians over approved steps only, and are hidden until a step
-- has enough finished files that no single file can be read back out of them.

alter table public.application_steps
  add column if not exists started_at timestamptz,
  add column if not exists decided_at timestamptz;

create or replace function private.stamp_step_times()
returns trigger
language plpgsql
as $$
declare
  v_active constant text[] := array['queued', 'in_progress', 'info_requested'];
  v_final constant text[] := array['approved', 'rejected', 'waived', 'n_a'];
begin
  if tg_op = 'INSERT' then
    if new.status = any (v_active) and new.started_at is null then new.started_at := now(); end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = any (v_active) then
    if new.started_at is null then new.started_at := now(); end if;
    -- A reopened step is no longer decided.
    new.decided_at := null;
  elsif new.status = any (v_final) then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists application_steps_stamp_times on public.application_steps;
create trigger application_steps_stamp_times
before insert or update of status on public.application_steps
for each row execute function private.stamp_step_times();

-- Steps already in flight get their last update as a start, so they are not
-- counted as never started. Decided steps are left alone: their real duration
-- is unknown, and a guess would poison the estimate.
update public.application_steps
set started_at = updated_at
where started_at is null and status in ('queued', 'in_progress', 'info_requested');

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
  where s.status = 'approved'
    and s.started_at is not null
    and s.decided_at is not null
    and s.decided_at >= s.started_at
  group by w.code
  having count(*) >= greatest(p_min_samples, 3)
$$;

-- Three is the floor. A caller can ask for a stricter minimum, never a looser one.
create or replace function public.step_estimates(p_min_samples integer default 3)
returns table (code text, samples integer, median_seconds bigint)
language sql
stable
set search_path = ''
as $$ select * from private.step_estimates(p_min_samples) $$;

revoke all on function public.step_estimates(integer) from public, anon;
revoke all on function private.step_estimates(integer) from public, anon, authenticated;
revoke all on function private.stamp_step_times() from public, anon, authenticated;
grant execute on function public.step_estimates(integer) to authenticated;
grant execute on function private.step_estimates(integer) to authenticated;

grant select (started_at, decided_at) on public.application_steps to authenticated;
