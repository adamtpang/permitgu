-- Three more permits made with the permit builder, from the sources already cited on
-- the guides: /public-spaces (the Waterworks service steps and the Power Authority
-- start-service page) and /events (Alcoholic Beverage Control Board agendas).
-- The water connection has published steps. The other two have one stand-in step each
-- where the agency does not publish its own, and say so.

-- 1. Water service connection, led by the Waterworks Authority.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_water_service', 'Water service connection', id,
  'Unofficial tracker for a new water connection and meter from the Guam Waterworks Authority. Apply any time during construction, ideally before your contractor works in the right of way. A sewer connection follows the same steps with a Wastewater Connection Permit and is not tracked separately here.',
  'approval', true, true,
  'https://guamwaterworks.org/faq/water-sewer-service-application/',
  '[
    {"key": "service_address", "label": "Service address and village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "lot_number", "label": "Lot number", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "who_is_applying", "label": "Who is applying", "kind": "choice", "required": true, "help": "Someone who is not the owner brings an authorization.", "choices": ["The owner", "Someone the owner authorized"]},
    {"key": "building_permit_number", "label": "Building permit number", "kind": "text", "required": false, "help": "Waterworks asks for your building permit.", "choices": []},
    {"key": "directions_to_the_site", "label": "Directions to the site", "kind": "long", "required": false, "help": "Waterworks asks for a map to the site.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'gwa'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Customer Service: account and work order', 'gwa', 'intake', 'always', 10, 'Bring the customer information paper, your certificate of title or deed of gift, your building permit, and a map to the site. Waterworks gives you an account and work order number. Customer Service: (671) 647-7800.'),
  ('s_permit_to_tap', 'Permit to Tap', 'gwa', 'clearance', 'always', 100, 'Filled out with the Permits and Inspections staff once you have the work order number. (671) 300-6058.'),
  ('s_inspection', 'Inspection of the trench and tap', 'gwa', 'clearance', 'always', 110, 'Give Waterworks 48 hours'' notice before trenching, meter installation, or tapping. After inspection you get a Job Cost Sheet. In this tracker both review steps open together. The real order is the permit first.'),
  ('fee_assessment', 'Job Cost Sheet', 'gwa', 'fees', 'always', 900, 'No dollar amount is stored. The amount is on the Job Cost Sheet Waterworks gives you after inspection. A reviewer types it.'),
  ('tog_payment', 'Job Cost Sheet paid', 'gwa', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Meter installed', 'gwa', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Waterworks account or work order number.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_water_service'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, v.required, v.notes
from (values
  ('customer_information', 'Customer information paper', true, 'The Waterworks customer paper, dated October 2025 on its site.'),
  ('title_or_deed', 'Certificate of title or deed of gift', true, 'This is an unofficial demo. Upload a placeholder, not your real title.'),
  ('authorization', 'Authorization from the owner', false, 'Only if you are not the owner.')
) as v(code, name, required, notes)
join public.application_types t on t.code = 'x_water_service'
on conflict (application_type_id, code) do nothing;

-- 2. Power service connection, led by the Power Authority.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_power_service', 'Power service connection', id,
  'Unofficial tracker for starting electric service with the Guam Power Authority. Apply at the payment center in Fadian, the Hagåtña satellite office, Waterworks in upper Tumon, or by email.',
  'approval', true, true,
  'https://www.guampowerauthority.com/how-do-i/start-stop-move-services',
  '[
    {"key": "service_address", "label": "Service address and village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "kind_of_service", "label": "Kind of service", "kind": "choice", "required": true, "help": "Residential deposits run $125 to $500.", "choices": ["Residential", "Commercial"]},
    {"key": "your_right_to_the_property", "label": "Your right to the property", "kind": "choice", "required": true, "help": "The Power Authority asks for a deed, title, or lease with authorization.", "choices": ["Deed or title", "Lease with authorization"]},
    {"key": "date_service_is_needed", "label": "Date service is needed", "kind": "text", "required": false, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'gpa'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Application received', 'gpa', 'intake', 'always', 10, 'Bring the application, a photo ID, and your deed, title, or lease with authorization. (671) 647-5787. This demo does not ask for a photo ID. Show it to the Power Authority in person.'),
  ('s_service_review', 'Power Authority review', 'gpa', 'clearance', 'default_routed', 100, 'What the Power Authority checks between the application and connection is not published. This single review step stands in for it.'),
  ('fee_assessment', 'Fee and deposit assessment', 'gpa', 'fees', 'always', 900, 'No dollar amount is stored. The published application fee is $25, and residential security deposits run $125 to $500. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee and deposit paid', 'gpa', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Service connected', 'gpa', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Power Authority account number.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_power_service'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'deed_title_or_lease', 'Deed, title, or lease with authorization', true, 'This is an unofficial demo. Upload a placeholder, not your real paper.'
from public.application_types t where t.code = 'x_power_service'
on conflict (application_type_id, code) do nothing;

-- 3. Temporary alcohol license for an event, led by Revenue and Taxation.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_temporary_alcohol_license', 'Temporary alcohol license for an event', id,
  'Unofficial tracker for a temporary license to serve or sell alcohol at an event. Board agendas show organizers applying for temporary on-sale beer licenses, each naming the dates, hours, and a fenced or cordoned area. We did not find the current application, fee, or lead time, so start early and confirm with Revenue and Taxation.',
  'license', true, true,
  'https://www.guamtax.com/abc/ABCAgenda-04-27-2016.pdf',
  '[
    {"key": "event_and_organizer", "label": "Event and organizer", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "event_location", "label": "Where the event is", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "dates_and_hours", "label": "Dates and hours alcohol will be served", "kind": "text", "required": true, "help": "Applications on past Board agendas name the dates and hours.", "choices": []},
    {"key": "drinking_area", "label": "The fenced or cordoned area where people may drink", "kind": "long", "required": true, "help": "Applications on past Board agendas describe it.", "choices": []},
    {"key": "what_will_be_served", "label": "What will be served", "kind": "text", "required": false, "help": "The agendas we found show beer licenses.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'drt'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at Revenue and Taxation', 'drt', 'intake', 'always', 10, 'We did not find the current application. Ask Revenue and Taxation before you plan any alcohol sales.'),
  ('s_board_meeting', 'Alcoholic Beverage Control Board meeting', 'abcboard', 'clearance', 'default_routed', 100, 'Applications appear to go before the Board at its meetings, from the agendas published on guamtax.com. Not confirmed as the rule for every event.'),
  ('fee_assessment', 'Fee assessment', 'drt', 'fees', 'always', 900, 'No dollar amount is stored. We did not find the current fee. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'drt', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Temporary license issued', 'drt', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Revenue and Taxation license number.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_temporary_alcohol_license'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

-- 4. Catalog rows, so the catalog offers these trackers.
insert into public.permit_catalog (code, name, group_name, agency_label, agency_code, agency_codes, source, unverified, trackable, application_type_code)
values
  ('water-service-connection', 'Water service connection and meter', '1. Build / renovate a home', 'Guam Waterworks Authority', 'gwa', array['gwa'], 'https://guamwaterworks.org/faq/water-sewer-service-application/', false, true, 'x_water_service'),
  ('power-service-connection', 'Power service connection', '1. Build / renovate a home', 'Guam Power Authority', 'gpa', array['gpa'], 'https://www.guampowerauthority.com/how-do-i/start-stop-move-services', false, true, 'x_power_service'),
  ('temporary-alcohol-license-for-an-event', 'Temporary alcohol license for an event', '9. Events / alcohol / tobacco', 'Revenue and Taxation, Alcoholic Beverage Control Board', 'drt', array['drt', 'abcboard'], 'https://www.guamtax.com/abc/ABCAgenda-04-27-2016.pdf', true, true, 'x_temporary_alcohol_license')
on conflict (code) do nothing;
