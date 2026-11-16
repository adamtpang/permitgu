-- The first two permits made with the permit builder, plus the link between a built
-- permit and its row in the catalog, plus two catalog cleanups.
-- Every step and note below comes from the sources already cited on the guides:
-- /food-truck (DPHSS forms and release PR26-044) and /zoning (21 GCA Chapter 61 and DLM forms).

-- 1. A built permit can point at its catalog row, so the catalog shows "Open the tracker".
create or replace function private.link_type_catalog(p_type_code text, p_catalog_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.application_types;
  v_catalog text := nullif(btrim(coalesce(p_catalog_code, '')), '');
begin
  perform private.require_super();
  v := private.builder_type(p_type_code);
  if v_catalog is not null and not exists (select 1 from public.permit_catalog where code = v_catalog) then raise exception 'not_found'; end if;
  if v_catalog is not null and exists (
    select 1 from public.permit_catalog where code = v_catalog and application_type_code is not null and application_type_code <> v.code
  ) then raise exception 'already_exists'; end if;
  update public.permit_catalog set trackable = false, application_type_code = null where application_type_code = v.code;
  if v_catalog is not null then
    update public.permit_catalog set trackable = true, application_type_code = v.code where code = v_catalog;
  end if;
  perform private.write_audit(null, 'link_type_catalog', 'application_type', v.id, v_catalog, null, null, 'staff');
end;
$$;

create or replace function public.link_type_catalog(p_type_code text, p_catalog_code text)
returns void language sql set search_path = '' as $$ select private.link_type_catalog(p_type_code, p_catalog_code) $$;
revoke all on function public.link_type_catalog(text, text) from public, anon;
revoke all on function private.link_type_catalog(text, text) from public, anon, authenticated;
grant execute on function public.link_type_catalog(text, text), private.link_type_catalog(text, text) to authenticated;

-- 2. Catalog cleanups. One directory row was read with its columns shifted, and a few
-- names carried a long dash.
update public.agencies
set code = 'ggrf', name = 'Government of Guam Retirement Fund (retiree/survivor + staff rows)', acronym = 'GGRF', notes = null
where code = 'governmentofguamretirementfund' and not exists (select 1 from public.agencies where code = 'ggrf');
update public.agencies set acronym = regexp_replace(name, '\s*\([^)]*\)', '', 'g') where acronym = U&'\2014';
update public.agencies set notes = replace(notes, U&' \2014 ', ': ') where notes like U&'% \2014 %';
update public.permit_catalog set name = replace(name, U&' \2014 ', ': ') where name like U&'% \2014 %';
update public.permit_catalog set source = replace(source, U&' \2014 ', ': ') where source like U&'% \2014 %';
update public.permit_catalog set agency_label = replace(agency_label, U&' \2014 ', ': ') where agency_label like U&'% \2014 %';

-- 3. Sanitary permit for a food establishment, led by Public Health.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_sanitary_permit_food', 'Sanitary permit for a food establishment', id,
  'Unofficial tracker for a new sanitary permit for a food establishment, including a food truck. It follows Form A and Form B through Public Health''s Division of Environmental Health. Renewals and one-off event permits are out of this flow.',
  'permit', true, true,
  'https://web.archive.org/web/20260711205311/https://dphss.guam.gov/sites/default/files/SANITARY%20PERMIT%20APPLICATION.pdf',
  '[
    {"key": "name_of_the_establishment", "label": "Name of the establishment", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "kind_of_establishment", "label": "Kind of establishment", "kind": "choice", "required": true, "help": "Guam law makes it unlawful to run a mobile food service establishment without a valid sanitary permit.", "choices": ["Fixed location", "Mobile (food truck or cart)"]},
    {"key": "where_it_operates", "label": "Where it operates", "kind": "text", "required": true, "help": "Lot, street address, and village. For a truck, where it is based.", "choices": []},
    {"key": "food_prepared_or_sold", "label": "Food prepared or sold", "kind": "long", "required": true, "help": null, "choices": []},
    {"key": "number_of_employees", "label": "Number of employees", "kind": "text", "required": false, "help": "The yearly fee covers 1 to 10 employees, plus $5 for each one more (DPHSS release PR26-044).", "choices": []}
  ]'::jsonb
from public.agencies where code = 'dphss'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake: Form A and Form B', 'dphss', 'intake', 'always', 10, 'New establishments file Form A (sanitary application) and Form B (food establishment supplement) with the Plans and Specifications Section, Division of Environmental Health.'),
  ('s_plan_review', 'Plan review', 'dphss', 'clearance', 'always', 100, 'The permit is issued after plan review and an inspection. How long plan review takes is not published.'),
  ('s_inspection', 'Inspection before opening', 'dphss', 'clearance', 'always', 110, 'The permit is issued after plan review and an inspection. In this tracker both steps open together. The real order is plan review first.'),
  ('fee_assessment', 'Fee assessment', 'dphss', 'fees', 'always', 900, 'No dollar amount is stored. DPHSS release PR26-044 sets $568 a year from January 1, 2026 for 1 to 10 employees, plus $5 for each one more, pro-rated to the renewal date. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'dphss', 'fees', 'always', 910, 'PermitGU does not take payment. Where this fee is paid is not confirmed.'),
  ('issue', 'Sanitary permit issued', 'dphss', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Public Health permit number. A sanitary permit cannot be moved to another person or establishment.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_sanitary_permit_food'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, true, v.notes
from (values
  ('form_a', 'Sanitary permit application (Form A)', 'The copy linked from the food truck guide is archived. Confirm the current one with Environmental Health at (671) 922-2533.'),
  ('form_b', 'Food establishment supplement (Form B)', 'The copy linked from the food truck guide is the 2021 version. Confirm the current one with Environmental Health.')
) as v(code, name, notes)
join public.application_types t on t.code = 'x_sanitary_permit_food'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_sanitary_permit_food'
where code = 'sanitary-permit-form-a-new-establishment' and application_type_code is null;

-- 4. Zone variance, filed with Land Management and decided by the Land Use Commission.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_zone_variance', 'Zone variance', id,
  'Unofficial tracker for a zone variance: asking the Guam Land Use Commission to vary height, yards, lot size, density, or parking on one lot. Zone changes, conditional uses, and the small setback variance the Land Management Director can approve are out of this flow.',
  'approval', true, true,
  'https://dlm.guam.gov/wp-dlm-content/uploads/2025/04/GLUC-Form-03_ZoneVariance-2020.pdf',
  '[
    {"key": "lot_block_and_tract", "label": "Lot, block, and tract numbers", "kind": "text", "required": true, "help": "Every zoning paper asks for them.", "choices": []},
    {"key": "village", "label": "Village", "kind": "text", "required": true, "help": "Hearings are held in the village where the lot is.", "choices": []},
    {"key": "current_zone", "label": "Current zone", "kind": "choice", "required": true, "help": "Land Management can certify a lot''s zone for $10 (21 GCA §61660).", "choices": ["A", "R1", "R2", "P", "C", "M1", "M2", "LC", "H", "S-1", "PF"]},
    {"key": "what_to_vary", "label": "What you are asking to vary", "kind": "choice", "required": true, "help": "These are the five things the Commission can vary (21 GCA §61616).", "choices": ["Height", "Yards (setbacks)", "Lot size", "Density", "Parking"]},
    {"key": "why_the_lot_cannot_meet_the_rule", "label": "Why the lot cannot meet the rule", "kind": "long", "required": true, "help": "The Commission looks for a real hardship from the lot''s size, shape, or topography.", "choices": []},
    {"key": "certificate_of_title_number", "label": "Certificate of title number", "kind": "text", "required": false, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'dlm'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Division of Planning', 'dlm', 'intake', 'always', 10, 'The application is filed with the Commission''s Executive Secretary, care of the Land Management Division of Planning.'),
  ('s_notice_sign', 'Notice sign posted on the lot', 'dlm', 'clearance', 'always', 100, 'A sign at least 4 ft by 8 ft goes up within 5 days of filing. Missing a notice step makes any approval null and void (21 GCA §61619).'),
  ('s_arc_review', 'Application Review Committee review', 'arc', 'clearance', 'default_routed', 110, 'Land Management agendas show the committee setting a 30-day timeline once an application is on its agenda. Assumed for every variance here. Not confirmed as a rule.'),
  ('s_village_council', 'Village planning council resolution received', 'dlm', 'clearance', 'always', 120, 'The village Municipal Planning Council holds at least two public meetings and sends the Commission a resolution for or against (21 GCA §61623). Tracked under Land Management because the village councils are not in the agency list.'),
  ('s_public_hearing', 'Public hearing in the village', 'gluc', 'clearance', 'always', 130, 'Hearings are held in the village, and at least one variance hearing must be after 6:00 p.m. (21 GCA §61619).'),
  ('s_commission_decision', 'Commission decision', 'gluc', 'clearance', 'always', 140, 'The Commission must find all four: a real hardship, exceptional conditions on the lot, no harm to the neighborhood, and no conflict with the Master Plan (21 GCA §61617). In this tracker the review steps open together. The real order runs from the sign to the decision.'),
  ('fee_assessment', 'Fee assessment', 'dlm', 'fees', 'always', 900, 'No dollar amount is stored. The law sets a $75 filing fee for a zone variance, plus the cost of notices (21 GCA §61660). The real fee is due at filing. This tracker records it after review.'),
  ('tog_payment', 'Fee paid in person', 'dlm', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Decision recorded', 'dlm', 'issuance', 'always', 920, 'The number shown is a demo number. The real decision is recorded at Land Management and Public Works. Anyone aggrieved has 15 days from that filing to ask the Superior Court to review it (21 GCA §61621).')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_zone_variance'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'gluc_form_03', 'Zone variance application (GLUC Form 03)', true, 'The list of attachments is on the paper itself.'
from public.application_types t where t.code = 'x_zone_variance'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_zone_variance'
where code = 'zone-variance-gluc-form-03' and application_type_code is null;
