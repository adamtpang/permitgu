-- Two more permits made with the permit builder. Every step and note comes from the
-- sources already cited on the guides: /clear-grade (the DPW clearing and grading paper
-- and 21 GCA §66202.1) and /events (the archived DPHSS temporary food application).

-- 1. Clearing and grading permit, led by Public Works.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_clearing_grading', 'Clearing and grading permit', id,
  'Unofficial tracker for the Public Works clearing and grading permit, with the sign-offs listed on its application. Guam EPA issues its own clearing, grubbing, grading and stockpiling permit. That one is separate and is not tracked here.',
  'permit', true, true,
  'https://www.govguamdocs.com/dpw/docs/Application%20and%20Permit%20For%20Clearing%20&%20Grading.pdf',
  '[
    {"key": "lot_block_and_tract", "label": "Lot, block, and tract numbers", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "district_or_village", "label": "District or village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "lot_area", "label": "Lot area", "kind": "text", "required": true, "help": "In square meters or square feet. Say which.", "choices": []},
    {"key": "cubic_yards_of_cut_and_fill", "label": "Estimated cubic yards of cut and fill", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "soil_description", "label": "Soil description", "kind": "long", "required": true, "help": null, "choices": []},
    {"key": "start_and_finish_dates", "label": "Start and finish dates", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "contractor_license_number", "label": "Contractor license number", "kind": "text", "required": false, "help": "The application asks for it.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'dpw'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at Building Permits and Inspection', 'dpw', 'intake', 'always', 10, 'Filed with the Public Works Division of Building Permits and Inspection. The paper posted online is an older version. Ask the permit center whether a newer one is in use.'),
  ('s_zoning', 'Zoning approval', 'dlm', 'clearance', 'default_routed', 100, 'Listed on the Public Works application as an approval. Assumed for every file here. Not confirmed as a rule.'),
  ('s_survey', 'Survey Division approval', 'dlm', 'clearance', 'default_routed', 110, 'Listed on the Public Works application as an approval. Assumed for every file here. Not confirmed as a rule.'),
  ('s_parks', 'Parks and Recreation approval', 'dpr', 'clearance', 'default_routed', 120, 'Listed on the Public Works application as an approval. Assumed for every file here. Not confirmed as a rule.'),
  ('s_power', 'Power Authority approval', 'gpa', 'clearance', 'default_routed', 130, 'Listed on the Public Works application as an approval. Assumed for every file here. Not confirmed as a rule.'),
  ('s_guam_epa', 'Guam EPA approval', 'gepa', 'clearance', 'default_routed', 140, 'Listed on the Public Works application as an approval. A March 2025 Public Auditor report says delays often come from this sign-off. Guam EPA also issues its own clearing permit, which is separate.'),
  ('s_burning_permit', 'Fire Department burning permit', 'gfd', 'clearance', 'as_indicated', 150, 'Only if cleared brush will be burned. The application says no burning on site unless the Fire Department has issued a burning permit.'),
  ('fee_assessment', 'Fee assessment', 'dpw', 'fees', 'always', 900, 'No dollar amount is stored. We found no published fee for a typical lot. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'dpw', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Permit issued', 'dpw', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Public Works permit number. Government agencies need this permit too, the same as private owners (21 GCA §66202.1).')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_clearing_grading'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'clearing_application', 'Application and Permit for Clearing and Grading', true,
  'The Public Works paper. The application also lists a telephone sign-off. Who handles it now is not confirmed, so it is not a step here.'
from public.application_types t where t.code = 'x_clearing_grading'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_clearing_grading'
where code = 'clearing-grading-stockpiling-permit-often-with-gepa' and application_type_code is null;

-- 2. Temporary food permit for an event, led by Public Health.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_temporary_food_event', 'Temporary food permit for an event', id,
  'Unofficial tracker for a Temporary Food Service Establishment sanitary permit: what a food seller needs at a fiesta, fair, or night market. Each event location needs its own permit. Year-round food businesses use the sanitary permit tracker.',
  'permit', true, true,
  'https://web.archive.org/web/20250903054503/http://dphss.guam.gov/wp-content/uploads/2019/05/TFSE-Application-Fillable.pdf',
  '[
    {"key": "booth_or_seller_name", "label": "Name of the booth or seller", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "event_name", "label": "Event", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "event_location", "label": "Where the event is", "kind": "text", "required": true, "help": "You need a separate permit for the location of each event.", "choices": []},
    {"key": "event_dates", "label": "Event dates", "kind": "text", "required": true, "help": "Apply as early as you can so the permit is issued before the event.", "choices": []},
    {"key": "food_sold", "label": "Food you will sell", "kind": "long", "required": true, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'dphss'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at Plans and Specifications', 'dphss', 'intake', 'always', 10, 'Filed with the Plans and Specifications Section, Division of Environmental Health, at the permit center. The application posted online is a 2019 copy. Confirm the current one at (671) 922-2533.'),
  ('s_review', 'Environmental Health review', 'dphss', 'clearance', 'default_routed', 100, 'What happens between filing and the permit is not published. This single review step stands in for it until Public Health confirms the real steps.'),
  ('fee_assessment', 'Fee assessment', 'dphss', 'fees', 'always', 900, 'No dollar amount is stored. We did not find the fee for this permit. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'dphss', 'fees', 'always', 910, 'PermitGU does not take payment. Where this fee is paid is not confirmed.'),
  ('issue', 'Temporary permit issued', 'dphss', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Public Health permit number. Selling without a valid permit can lead to a fine and closure of the booth.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_temporary_food_event'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'tfse_application', 'Temporary food service application', true, 'The copy linked from the events guide is archived. Confirm the current one with Environmental Health.'
from public.application_types t where t.code = 'x_temporary_food_event'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_temporary_food_event'
where code = 'temporary-food-service-establishment-tfse-sanitary-permit' and application_type_code is null;
