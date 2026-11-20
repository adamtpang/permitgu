-- Real steps for six permits that were first built from thin sources, researched on
-- 2026-11-20 from the official forms and the law. Each step says what is still not
-- confirmed. Steps that happen after a permit is issued (road restoration inspection,
-- park deposit refund) are described on the issue step, because the tracker stops at issue.

-- Shared helper for this file: insert or update one step.
create or replace function pg_temp.put_step(p_type text, p_code text, p_name text, p_agency text, p_phase text, p_routing text, p_sort integer, p_note text)
returns void language sql as $$
  insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
  select t.id, p_code, p_name, a.id, p_phase, p_routing, p_sort, p_note
  from public.application_types t, public.agencies a
  where t.code = p_type and a.code = p_agency
  on conflict (application_type_id, code) do update
    set name = excluded.name, agency_id = excluded.agency_id, phase = excluded.phase,
        routing = excluded.routing, sort_order = excluded.sort_order, uncertainty = excluded.uncertainty;
$$;

create or replace function pg_temp.put_doc(p_type text, p_code text, p_name text, p_required boolean, p_notes text)
returns void language sql as $$
  insert into public.required_documents (application_type_id, code, name, required, notes)
  select t.id, p_code, p_name, p_required, p_notes from public.application_types t where t.code = p_type
  on conflict (application_type_id, code) do update
    set name = excluded.name, required = excluded.required, notes = excluded.notes;
$$;

-- 1. Work in a public road. Source: 5 GCA §53105 and the Waterworks utility clearance form.
select pg_temp.put_step('x_road_work', 's_gwa_clearance', 'Waterworks utility clearance', 'gwa', 'clearance', 'default_routed', 110,
  'For an excavation. Filed on Waterworks form ENGP-009 with the Public Works encroachment permit number and an aerial photo or engineering plans. Waterworks needs the start date at least 3 full working days before work starts, and its clearance is valid for 10 days.');
select pg_temp.put_step('x_road_work', 's_gpa_clearance', 'Power Authority utility clearance', 'gpa', 'clearance', 'as_indicated', 120,
  'The Power Authority publishes clearance guidelines for digging near its lines. We did not confirm its steps, so this stays off until a reviewer adds it. We found nothing for the phone company.');
select pg_temp.put_step('x_road_work', 'issue', 'Permit issued', 'dpw', 'issuance', 'always', 920,
  'The number shown is a demo number. After it is issued: tell the village mayor the next working day, restore the road by the date on the permit, and fix a failed repair within 14 days. Public Works keeps the deposit for up to 3 months after the repair while it inspects. Paved repairs carry a 1-year warranty, unpaved 90 days (5 GCA §53105). This tracker stops at issue.');
select pg_temp.put_doc('x_road_work', 'gwa_utility_clearance', 'Waterworks utility clearance request (ENGP-009)', false,
  'Only for an excavation. Include an aerial photo or engineering plans, and stake or mark the area in the field.');
select pg_temp.put_doc('x_road_work', 'deposit_or_bond', 'Road deposit or performance bond', false,
  'Only for an excavation: $500 or 5% of the cost of the work affecting the road, whichever is more (5 GCA §53105(b)(1)). This demo does not take a real deposit.');

-- 2. Building permit for a repair. Source: the Public Works Application for Permit and
-- Plan Review and the 2022 Guidebook to Development Requirements.
select pg_temp.put_step('x_repair_permit', 'intake', 'Intake at Building Inspection and Permits', 'dpw', 'intake', 'always', 10,
  'Filed on the same Application for Permit and Plan Review as a new building, with "Repair" or "Reconstructed" checked. Owner-done work can be exempt: up to 25% of a roof covering, or nonstructural repairs up to 25% of the value (21 GCA §66202). Read the typhoon repair guide first.');
select pg_temp.put_step('x_repair_permit', 's_plan_review', 'Plan review', 'dpw', 'clearance', 'default_routed', 100,
  'The application lists Public Works reviews: architectural, structural, mechanical and plumbing, flood control, HPCC, hydraulics and civil, highway, right of way, and traffic. The Guidebook says each applies for what the project entails. A small repair may need only some.');
select pg_temp.put_step('x_repair_permit', 's_zoning', 'Land Management zoning clearance', 'dlm', 'clearance', 'as_indicated', 110,
  'On the application routing list. Required "for what the project entails" (2022 Guidebook). Not confirmed for every repair, so a reviewer adds it.');
select pg_temp.put_step('x_repair_permit', 's_clb', 'Contractors License Board clearance', 'clb', 'clearance', 'as_indicated', 120,
  'On the application routing list. Likely only when a contractor does the work. Not confirmed, so a reviewer adds it.');
select pg_temp.put_step('x_repair_permit', 's_peals', 'Engineer or architect stamp check', 'peals', 'clearance', 'as_indicated', 130,
  'On the application routing list. Likely only when stamped plans are filed for structural work. Not confirmed, so a reviewer adds it.');
select pg_temp.put_step('x_repair_permit', 's_other_agencies', 'Other clearances as indicated', 'dpw', 'clearance', 'as_indicated', 140,
  'The application also routes to Public Health, Guam EPA, Waterworks, the Power Authority, Fire Prevention, Parks, Agriculture, and the Army Corps as indicated. Which ones a repair needs is not published.');
select pg_temp.put_doc('x_repair_permit', 'plans', 'Plans and scope of work', false,
  'One hard copy and five digital sets of plans when plans are needed. For a renovation, the scope of work and total square footage.');
select pg_temp.put_doc('x_repair_permit', 'property_papers', 'Recorded property map, lease, or authorization', false,
  'From Land Management. This is an unofficial demo. Upload a placeholder, not your real paper.');

-- 3. Park or pavilion reservation. Source: the Parks and Recreation reservation and fee pages.
update public.application_types set source = 'https://dpr.guam.gov/fee-schedule/'
where code = 'x_park_reservation';
select pg_temp.put_step('x_park_reservation', 'intake', 'Intake at the Parks Division', 'dpr', 'intake', 'always', 10,
  'Call, email inquiries@dpr.guam.gov, or walk in at #1 Paseo de Susana, Hagåtña. Reservations are accepted three months in advance. We did not find a downloadable reservation form.');
select pg_temp.put_step('x_park_reservation', 's_parks_review', 'Parks Division review', 'dpr', 'clearance', 'default_routed', 100,
  'Parks checks that the site and date are free. We found no police or fire sign-off, tent rule, or sound rule for a park reservation. Food sales and alcohol need their own permits.');
select pg_temp.put_step('x_park_reservation', 'issue', 'Reservation confirmed', 'dpr', 'issuance', 'always', 920,
  'The number shown is a demo number. Clean up all trash before your time ends. The cleaning deposit comes back if there are no discrepancies or damage to the facility. This tracker stops at the confirmation.');

-- 4. Temporary food permit for an event. Source: the Temporary Food Service Establishment
-- application (archived 2019 copy) and the fee rule in 26 GAR §4506.
select pg_temp.put_step('x_temporary_food_event', 'intake', 'Intake at Plans and Specifications', 'dphss', 'intake', 'always', 10,
  'Form A and Form B, filed with the Plans and Specifications Section, Division of Environmental Health, at the Business License and Permit Center in upper Tumon. An application filed one day or less before the event pays a $50 expedited fee.');
select pg_temp.put_step('x_temporary_food_event', 's_review', 'Plan review and food safety briefing', 'dphss', 'clearance', 'default_routed', 100,
  'Environmental Health checks the menu, equipment, handwash station, and three-compartment sink. The form has the applicant sign that they were briefed on food safety. When the briefing happens is not confirmed.');
select pg_temp.put_step('x_temporary_food_event', 's_pre_operational_inspection', 'Pre-operational inspection', 'dphss', 'clearance', 'default_routed', 110,
  'The checklist names a Pre-Operational Inspection Report. Whether it happens before or on the event day is not confirmed.');
select pg_temp.put_step('x_temporary_food_event', 'fee_assessment', 'Fee assessment', 'dphss', 'fees', 'always', 900,
  'No dollar amount is stored. The fee rule (26 GAR §4506) sets $50 for 1 day, $125 for up to 7 days, $155 for weekends, $200 for up to 180 days, $300 for other terms, and $25 for a village Planning Council event. A reviewer types the assessed amount.');
select pg_temp.put_doc('x_temporary_food_event', 'tfse_application', 'Form A and Form B', true,
  'The copy linked from the events guide is archived. Confirm the current one with Environmental Health.');
select pg_temp.put_doc('x_temporary_food_event', 'menu_and_floor_plan', 'Menu, floor plan, and vicinity map', false,
  'Listed on the checklist with the business license, personnel list, health certificates, manager''s certificate, and smoking policy.');

-- 5. Temporary alcohol license. Source: the 2023 Alcoholic Beverage License application,
-- the ABC fee schedule, and 11 GCA Chapter 3.
update public.application_types set source = 'https://www.govguamdocs.com/revtax/docs/AlcoholicBeverageLicenseApplication(2023.11).pdf',
  summary = 'Unofficial tracker for a temporary license to serve or sell alcohol at an event. Nonprofits and clubs can apply for fundraisers, and existing licensees for temporary beer. A temporary license lasts no more than 10 days, and temporary beer no more than 3 (11 GCA §§3209, 3221). A business license is not needed.'
where code = 'x_temporary_alcohol_license';
select pg_temp.put_step('x_temporary_alcohol_license', 'intake', 'Intake at Revenue and Taxation', 'drt', 'intake', 'always', 10,
  'Filed on the Temporary Alcoholic Beverage License (TABL) application. The application says to submit it within 30 days before the event, which may mean no later than 30 days before. Confirm with Revenue and Taxation.');
select pg_temp.put_step('x_temporary_alcohol_license', 's_bpt_clearance', 'Business privilege tax clearance', 'drt', 'clearance', 'default_routed', 90,
  'On the 2023 application.');
select pg_temp.put_step('x_temporary_alcohol_license', 's_income_tax_clearance', 'Income tax clearance', 'drt', 'clearance', 'default_routed', 92,
  'On the 2023 application.');
select pg_temp.put_step('x_temporary_alcohol_license', 's_collections_clearance', 'Collections clearance', 'drt', 'clearance', 'default_routed', 94,
  'On the 2023 application.');
select pg_temp.put_step('x_temporary_alcohol_license', 's_board_meeting', 'Alcoholic Beverage Control Board approval', 'abcboard', 'clearance', 'default_routed', 100,
  'The Board approves temporary licenses at its meetings (11 GCA Chapter 3; a September 2026 news report covers the Board approving four). We found no police, mayor, or Public Health sign-off for a temporary license. Those are listed for regular licenses.');
select pg_temp.put_step('x_temporary_alcohol_license', 'fee_assessment', 'Fee assessment', 'drt', 'fees', 'always', 900,
  'No dollar amount is stored. The published fees: temporary beer (Class 7) $20 a day, temporary general (Class 10) $50 a day, each capped at $100 per event. A reviewer types the assessed amount.');

-- 6. Power service connection. Source: the Power Authority service application, form SP-100,
-- and its Electrical Inspection Report.
select pg_temp.put_step('x_power_service', 'intake', 'Application received', 'gpa', 'intake', 'always', 10,
  'Application and Agreement for Electric Service, with a photo ID and your deed, title, or lease with authorization. Businesses also bring a business license and EIN. For a new building, apply 8 months before you need power (12 for a padmount transformer). A house that already has a meter skips the reviews.');
select pg_temp.put_step('x_power_service', 's_service_review', 'Plan review and site investigation', 'gpa', 'clearance', 'default_routed', 100,
  'For new construction, the plans need a load calculation and an engineer''s seal, and Power Authority engineering visits the site. Underground jobs and easements add steps not tracked here.');
select pg_temp.put_step('x_power_service', 's_dpw_electrical_inspection', 'Public Works electrical inspection', 'dpw', 'clearance', 'default_routed', 110,
  'A new service is not energized without it. The Power Authority issues an Electrical Inspection Report form and a Public Works electrical inspector approves it (form SP-100: "DPW inspection report required").');
select pg_temp.put_step('x_power_service', 'fee_assessment', 'Fee and deposit assessment', 'gpa', 'fees', 'always', 900,
  'No dollar amount is stored. The published application fee is $25. Residential deposits run from $125 (1 bedroom, no air conditioning) to $500 (4 bedrooms with air conditioning). Other deposits are at most 2.5 times the estimated monthly bill and never under $125.');
select pg_temp.put_step('x_power_service', 'issue', 'Meter set and service energized', 'gpa', 'issuance', 'always', 920,
  'The number shown is a demo number. It is not a Power Authority account number. Reconnecting an existing meter the same day costs $9.');

-- Swap the old sample files for these six permits. Their step lists no longer match, so
-- they are withdrawn and kept as test files (the record is append-only), and the sample
-- seed makes five new ones with the new steps the next time it runs.
do $swap$
declare v_count integer;
begin
  perform set_config('permitgu.trusted_write', '1', true);
  update public.applications a set is_sample = false, is_test = true, status = 'withdrawn'
  from public.application_types t
  where t.id = a.application_type_id and a.is_sample
    and t.code in ('x_road_work', 'x_repair_permit', 'x_park_reservation', 'x_temporary_food_event', 'x_temporary_alcohol_license', 'x_power_service');
  get diagnostics v_count = row_count;
  perform set_config('permitgu.trusted_write', '', true);
  perform private.write_audit(null, 'retire_sample_files', 'application', null, null, null,
    jsonb_build_object('files', v_count, 'reason', 'steps researched 2026-11-20'), 'staff');
end
$swap$;
