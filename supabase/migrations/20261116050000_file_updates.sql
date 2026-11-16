-- "What changed since you last looked": for each of the signed-in person's files, how
-- many agency actions happened after they last opened the tracker, and the latest one.
-- This is the in-app half of telling an applicant their file moved. Email is not connected.

create or replace function private.my_file_updates()
returns table (application_id uuid, unread integer, last_action text, last_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
    count(*)::integer,
    (array_agg(e.action order by e.id desc))[1],
    max(e.created_at)
  from public.applications a
  left join lateral (
    select max(v.created_at) as at
    from public.audit_log v
    where v.application_id = a.id and v.action = 'view_application'
      and v.actor_id = auth.uid() and v.memo = 'Opened the tracker'
  ) seen on true
  join public.audit_log e
    on e.application_id = a.id
   and e.visibility = 'citizen'
   and e.created_at > coalesce(seen.at, a.created_at)
   and (
     e.action in ('review_step', 'route_step', 'request_info', 'assess_fees', 'fees_paid_in_person', 'issue', 'deny', 'expire', 'reopen_step')
     or (e.action = 'comment' and e.actor_id is distinct from auth.uid())
   )
  where a.applicant_id = auth.uid()
  group by a.id;
$$;

create or replace function public.my_file_updates()
returns table (application_id uuid, unread integer, last_action text, last_at timestamptz)
language sql stable set search_path = '' as $$ select * from private.my_file_updates() $$;
revoke all on function public.my_file_updates() from public, anon;
revoke all on function private.my_file_updates() from public, anon, authenticated;
grant execute on function public.my_file_updates(), private.my_file_updates() to authenticated;
