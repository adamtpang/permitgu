-- The first catalog seed read two explanatory tables in docs/sources/guam-agencies.md
-- (what "~51 agencies" refers to, and the recommended totals) as agencies. They are
-- counts, not agencies. Remove them and repair the two permits they affected.

update public.permit_catalog set agency_code = 'gboa'
where code = 'cpa-accountancy' and exists (select 1 from public.agencies where code = 'gboa');

update public.permit_catalog set agency_code = 'guamrealestatecommission'
where code = 'real-estate-broker-salesperson' and agency_code is null
  and exists (select 1 from public.agencies where code = 'guamrealestatecommission');

delete from public.agencies a
where a.code in ('count', '58numberedrows', '70listings', 'overlapslegislaturelist', 'statutorychapters',
                 'approxcount', '40', '18rows', '57', '20', '1')
  and not exists (select 1 from public.memberships m where m.agency_id = a.id)
  and not exists (select 1 from public.workflow_steps w where w.agency_id = a.id)
  and not exists (select 1 from public.application_steps s where s.agency_id = a.id)
  and not exists (select 1 from public.permit_catalog p where p.agency_code = a.code);
