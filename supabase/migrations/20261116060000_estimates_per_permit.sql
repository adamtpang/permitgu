-- Step codes such as fee_assessment are shared by every tracked permit. An estimate
-- for one permit must come only from finished files of that same permit.

create or replace function private.step_estimates_for(p_type_code text, p_min_samples integer)
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

create or replace function public.step_estimates_for(p_type_code text, p_min_samples integer default 3)
returns table (code text, samples integer, median_seconds bigint)
language sql stable set search_path = '' as $$ select * from private.step_estimates_for(p_type_code, p_min_samples) $$;
revoke all on function public.step_estimates_for(text, integer) from public, anon;
revoke all on function private.step_estimates_for(text, integer) from public, anon, authenticated;
grant execute on function public.step_estimates_for(text, integer), private.step_estimates_for(text, integer) to authenticated;
