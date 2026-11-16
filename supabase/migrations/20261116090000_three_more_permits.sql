-- Three more permits made with the permit builder, from the sources already cited on
-- the guides: /public-spaces (5 GCA Chapter 53), /typhoon-repair (21 GCA Chapter 66 and
-- the Public Works application), and /events (Parks and Recreation reservations and fees).
-- Where an agency does not publish its steps, one review step stands in and says so.

-- 1. Work in a public road, led by Public Works.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_road_work', 'Permit for work in a public road', id,
  'Unofficial tracker for the Public Works permit to dig in, build on, or place anything in a public road. The road is the whole right of way, not only the paved lanes. Water, sewer, and power hookups go through the utilities and are not tracked here.',
  'permit', true, true,
  'https://col.guamcourts.gov/sites/default/files/5gc053.pdf',
  '[
    {"key": "road_and_village", "label": "Road and village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "kind_of_work", "label": "Kind of work", "kind": "choice", "required": true, "help": "These are the four things the law says need a written permit (5 GCA §53102).", "choices": ["Opening or excavation", "Encroachment (pipe, pole, fence, sign, or structure)", "Advertising sign", "Planting, cutting, or removing a tree or plant"]},
    {"key": "what_you_will_do", "label": "What you will do", "kind": "long", "required": true, "help": null, "choices": []},
    {"key": "date_the_road_will_be_restored", "label": "Date the road will be restored", "kind": "text", "required": true, "help": "Every application to excavate needs a deadline for restoring the road to its original condition or better (5 GCA §53105(a)).", "choices": []},
    {"key": "cost_of_the_work_affecting_the_road", "label": "Cost of the work affecting the road", "kind": "text", "required": false, "help": "An excavation needs a deposit of $500 or 5% of this cost, whichever is more (5 GCA §53105(b)).", "choices": []},
    {"key": "contractor", "label": "Contractor, if you have one", "kind": "text", "required": false, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'dpw'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Highways Division', 'dpw', 'intake', 'always', 10, 'Filed with the Highway Encroachment and Permit section, (671) 649-3159. We found no application paper online.'),
  ('s_highways_review', 'Highways Division review', 'dpw', 'clearance', 'default_routed', 100, 'What Public Works checks before it issues the permit is not published. This single review step stands in for it. Public Works may require a bond and may supervise the work at your cost (5 GCA §§53104, 53105(e)).'),
  ('fee_assessment', 'Fee and deposit assessment', 'dpw', 'fees', 'always', 900, 'No dollar amount is stored. The law mentions an application fee and does not set an amount. An excavation also needs a deposit of $500 or 5% of the cost of the work affecting the road, whichever is more. A surety bond can stand in its place (5 GCA §53105(b)).'),
  ('tog_payment', 'Fee and deposit paid in person', 'dpw', 'fees', 'always', 910, 'PermitGU does not take payment. A good repair gets the deposit back in full. The application fee is not refunded.'),
  ('issue', 'Permit issued', 'dpw', 'issuance', 'always', 920, 'The number shown is a demo number. After it is issued: tell the village mayor before digging and again when the road is restored, restore the road by the date on the permit, and Public Works keeps the deposit for up to 3 months after its inspection (5 GCA §53105). This tracker stops at issue and does not follow those.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_road_work'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'schedule_of_work', 'Schedule of work with the restoration deadline', true, 'Required by law for an excavation (5 GCA §53105(a)).'
from public.application_types t where t.code = 'x_road_work'
on conflict (application_type_id, code) do nothing;

-- 2. Building permit for a repair, led by Public Works.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_repair_permit', 'Building permit for a repair', id,
  'Unofficial tracker for a building permit to repair or reconstruct an existing building, such as after a typhoon. Small repairs done by the owner are often exempt. Read the typhoon repair guide first to see whether you need a permit at all.',
  'permit', true, true,
  'https://bsp.guam.gov/wp-content/uploads/2026/08/DPW-Application-for-Permit-and-Plan-Review-Fillable.pdf',
  '[
    {"key": "lot_tract_and_block", "label": "Lot, tract, and block", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "zoning_district", "label": "Zoning district", "kind": "text", "required": true, "help": "As you understand it. This demo does not look the zone up.", "choices": []},
    {"key": "repair_or_reconstruction", "label": "Repair or reconstruction", "kind": "choice", "required": true, "help": "The application has a box for each.", "choices": ["Repair", "Reconstructed"]},
    {"key": "scope_of_work", "label": "Scope of work", "kind": "long", "required": true, "help": "Say whether the work touches roof framing, beams, or load-bearing walls.", "choices": []},
    {"key": "cost_of_improvements", "label": "Cost of improvements", "kind": "text", "required": true, "help": "Roofing counts in the valuation that sets the fee. Repairs over 50% of the building''s value in 12 months must meet the code for new buildings (21 GCA §66104).", "choices": []},
    {"key": "in_a_flood_zone", "label": "Is the property in a flood zone", "kind": "choice", "required": true, "help": "A flood zone needs a topographic map and a flood elevation certificate.", "choices": ["No", "Yes", "Not sure"]},
    {"key": "contractor_license_number", "label": "Contractor license number", "kind": "text", "required": false, "help": "Check the contractor on the Contractors License Board listing before you pay anything.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'dpw'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at Building Inspection and Permits', 'dpw', 'intake', 'always', 10, 'Filed on the Application for Permit and Plan Review with "Repair" or "Reconstructed" checked. The owner or lessee signs, along with the contractor and any architect or engineer.'),
  ('s_plan_review', 'Plan review', 'dpw', 'clearance', 'default_routed', 100, 'Which reviews a repair gets is not published. This single step stands in for them. A new house goes through six review disciplines. A repair may need fewer.'),
  ('s_other_agencies', 'Clearances from other agencies', 'dpw', 'clearance', 'as_indicated', 110, 'The application lists agencies that clear a permit as indicated. Which ones a repair needs is not published, so this stays off until a reviewer adds it.'),
  ('fee_assessment', 'Fee assessment', 'dpw', 'fees', 'always', 900, 'No dollar amount is stored. We found no published fee for a typical roof repair. Fees double if work starts before the permit (21 GCA §66408).'),
  ('tog_payment', 'Fee paid in person', 'dpw', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Permit issued', 'dpw', 'issuance', 'always', 920, 'The number shown is a demo number. After it is issued, schedule Public Works inspections as work progresses and keep the permit and approved plans on site. This tracker stops at issue.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_repair_permit'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, v.required, v.notes
from (values
  ('permit_application', 'Application for Permit and Plan Review', true, 'Someone applying for the owner must include the owner''s verified affidavit authorizing them.'),
  ('flood_papers', 'Topographic map and flood elevation certificate', false, 'Only if the property is in a flood zone.')
) as v(code, name, required, notes)
join public.application_types t on t.code = 'x_repair_permit'
on conflict (application_type_id, code) do nothing;

-- 3. Park or pavilion reservation, led by Parks and Recreation.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_park_reservation', 'Park or pavilion reservation', id,
  'Unofficial tracker for reserving a government park, pavilion, or beach area with Parks and Recreation. A reservation guarantees your location, date, and time. Reservations open three months before the event. Food sales, road closures, and alcohol need their own permits.',
  'approval', true, true,
  'https://dpr.guam.gov/3687-2/',
  '[
    {"key": "event_name", "label": "Event", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "park", "label": "Park", "kind": "text", "required": true, "help": "Parks and Recreation publishes a park list.", "choices": []},
    {"key": "what_you_are_reserving", "label": "What you are reserving", "kind": "choice", "required": true, "help": "Listed fees: large pavilion $75 a day, small pavilion $15, open area or canopy $10, amphitheater $125, special event $500. The fee page shows no effective date.", "choices": ["Large pavilion", "Small pavilion", "Open area or canopy", "Amphitheater", "Special event"]},
    {"key": "date_and_time", "label": "Date and time", "kind": "text", "required": true, "help": "Reservations open three months before the event.", "choices": []},
    {"key": "crowd_size", "label": "Crowd size", "kind": "choice", "required": true, "help": "Sets the refundable cleaning deposit: $75, $150, $250, $500, or $1,000.", "choices": ["Up to 99", "100 to 249", "250 to 499", "500 to 1,000", "Over 1,000"]},
    {"key": "anything_else", "label": "Anything else the park office should know", "kind": "long", "required": false, "help": "Fire is allowed only in the BBQ pits. Nothing may be tied to trees or historic structures.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'dpr'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Parks Division', 'dpr', 'intake', 'always', 10, 'Parks Division, #1 Paseo De Susana, Hagåtña, (671) 475-6288. We did not find a downloadable permit paper.'),
  ('s_parks_review', 'Parks Division review', 'dpr', 'clearance', 'default_routed', 100, 'How Parks and Recreation checks a date and approves a reservation is not published. This single review step stands in for it.'),
  ('fee_assessment', 'Fee and deposit assessment', 'dpr', 'fees', 'always', 900, 'No dollar amount is stored. The published schedule lists a daily fee by facility and a refundable cleaning deposit by crowd size. The schedule shows no effective date, and vendors have reported different amounts. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee and deposit paid in person', 'dpr', 'fees', 'always', 910, 'PermitGU does not take payment. In person, 8 a.m. to noon and 1 to 3 p.m. Closed weekends and holidays.'),
  ('issue', 'Reservation confirmed', 'dpr', 'issuance', 'always', 920, 'The number shown is a demo number. You pay for any damage and must clean up all trash before your time ends.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_park_reservation'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

-- 4. Catalog rows, so the catalog offers these trackers.
insert into public.permit_catalog (code, name, group_name, agency_label, agency_code, agency_codes, source, unverified, trackable, application_type_code)
values
  ('permit-for-work-in-a-public-road', 'Permit for work in a public road (excavation or encroachment)', '1. Build / renovate a home', 'DPW Highways Division', 'dpw', array['dpw'], 'https://col.guamcourts.gov/sites/default/files/5gc053.pdf', false, true, 'x_road_work'),
  ('building-permit-for-a-repair', 'Building permit for a repair or reconstruction', '1. Build / renovate a home', 'DPW Building Inspection and Permits', 'dpw', array['dpw'], 'https://bsp.guam.gov/wp-content/uploads/2026/08/DPW-Application-for-Permit-and-Plan-Review-Fillable.pdf', false, true, 'x_repair_permit'),
  ('park-or-pavilion-reservation', 'Park or pavilion reservation', '9. Events / alcohol / tobacco', 'Department of Parks and Recreation', 'dpr', array['dpr'], 'https://dpr.guam.gov/3687-2/', false, true, 'x_park_reservation')
on conflict (code) do nothing;
