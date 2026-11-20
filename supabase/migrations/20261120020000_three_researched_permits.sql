-- Three more permits made with the permit builder, researched 2026-11-20:
--   Conditional use: GLUC Form 01 (June 2019 form, posted as the 2020 copy), which also carries
--     the Land Management application process chart, and 21 GCA Chapter 61 (COL 2026-04-23).
--   Seashore clearance: GSPC Form 01 (June 2019) and 21 GCA Chapter 63 (COL070307 copy).
--   Business license renewal: 11 GCA Chapter 70 (COL 2025-12-23) and the GuamTax.com business help
--     page. No current paper renewal form was found online.
-- Also fixes the road work issue note from 20261120010000: the mayor is told before digging and
-- again after restoration. "The next working day" applies only to an emergency dig (5 GCA §53105(f)).

update public.workflow_steps w
set uncertainty = 'The number shown is a demo number. After it is issued: tell the village mayor before digging starts and again when the road is restored (the next working day after an emergency dig), restore the road by the date on the permit, and fix a failed repair within 14 days. Public Works keeps the deposit for up to 3 months after the repair while it inspects. Paved repairs carry a 1-year warranty, unpaved 90 days (5 GCA §53105). This tracker stops at issue.'
from public.application_types t
where t.id = w.application_type_id and t.code = 'x_road_work' and w.code = 'issue';

-- 1. Conditional use permit, filed with Land Management and decided by the Land Use Commission.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_conditional_use', 'Conditional use permit', id,
  'Unofficial tracker for a conditional use permit: asking the Guam Land Use Commission to allow a use the zone permits only with its approval. The Commission reviews the site plan, including sewage disposal, access, parking, building location and size, and the effect on neighbors. Its conditions run with the land, and it can revoke the permit if they are not kept (21 GCA §61303).',
  'permit', true, true,
  'https://dlm.guam.gov/wp-dlm-content/uploads/2024/01/GLUC-Form-01_ConditionalUse-2020.pdf',
  '[
    {"key": "lot_block_and_tract", "label": "Lot, block, and tract numbers", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "village", "label": "Village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "current_zone", "label": "Current zone", "kind": "choice", "required": true, "help": null, "choices": ["A", "R1", "R2", "P", "C", "M1", "M2", "LC", "H", "S-1", "PF"]},
    {"key": "current_use", "label": "Current use of the lot", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "proposed_use", "label": "Proposed conditional use", "kind": "long", "required": true, "help": "The application asks for a one-page letter on how the use fits the neighborhood, covering sewage, access, parking, and building location.", "choices": []},
    {"key": "over_three_million", "label": "Will the project cost more than $3,000,000, not counting the land?", "kind": "choice", "required": true, "help": "If yes, a Hybrid Commission is empaneled to decide it (P.L. 33-219).", "choices": ["Yes", "No"]}
  ]'::jsonb
from public.agencies where code = 'dlm'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Land Planning Division', 'dlm', 'intake', 'always', 10, 'Filed in person, by appointment only, with the Commission''s Executive Secretary at the Land Planning Division. The form cannot be mailed. The form asks for 32 sets of papers plus 9 electronic copies. Land Management''s process chart shows a preliminary application interview of about ten working days and a case planner assigned. A copy goes to the village mayor (21 GCA §61106).'),
  ('s_notice_sign', 'Notice sign posted on the lot', 'dlm', 'clearance', 'always', 100, 'A sign at least 4 ft by 8 ft names the owner, developer, lot, proposed use, and each hearing date. It stays up with current information for at least 10 days in a row before each hearing or meeting (21 GCA §61303(c)). The application asks for a picture of the sign.'),
  ('s_mailed_notice', 'Notice to owners within 500 feet', 'dlm', 'clearance', 'always', 110, 'Personal written notice at least 10 days before the hearing, or certified mail at least 25 days before (21 GCA §61303(c)). Missing a notice step makes any approval null and void. Land Management''s chart also shows a newspaper notice 10 calendar days before. The applicant pays the mailing costs (21 GCA §61303(d)).'),
  ('s_arc_review', 'Application Review Committee review', 'arc', 'clearance', 'default_routed', 120, 'The committee should send its reports within 30 days of filing where possible (21 GCA §61106). Land Management''s process chart shows a 60 calendar day agency review period instead. Which one applies in practice is not confirmed. No village hearing is held until the reports are in.'),
  ('s_public_hearing', 'Public hearing in the village', 'gluc', 'clearance', 'always', 130, 'Held in the affected village after the committee''s reports reach the mayor (21 GCA §61106). Who runs the hearing and how it is scheduled is not confirmed.'),
  ('s_commission_decision', 'Commission decision', 'gluc', 'clearance', 'always', 140, 'The Commission approves, disapproves, or tables, then sends a Notice of Action. The law sets no deadline for this decision that we found. A project over $3,000,000 goes to a Hybrid Commission. In this tracker the review steps open together. The real order runs from the sign to the decision.'),
  ('fee_assessment', 'Fee assessment', 'dlm', 'fees', 'always', 900, 'No dollar amount is stored. The law sets a $50 filing fee for a conditional use permit (21 GCA §61660), plus the cost of mailed notice, paper, and envelopes (21 GCA §61303(d)). The form adds $2.00 for the first five pages and $0.25 for each page after. The real fee is due at filing. This tracker records it after review.'),
  ('tog_payment', 'Fee paid in person', 'dlm', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Conditional use approved and recorded', 'dlm', 'issuance', 'always', 920, 'The number shown is a demo number. The decision is filed with the Land Management Registrar and in Public Works records (21 GCA §61303). How to appeal a denial was not confirmed.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_conditional_use'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, true, v.notes
from (values
  ('conditional_use_application', 'Conditional use application (GLUC Form 01)', 'With the one-page justification letter. In this demo, upload a placeholder.'),
  ('site_plan_and_maps', 'Site plan and maps', 'A site plan drawn to scale, a map of buildings and uses out to 750 ft, a parcel map out to 500 ft, and the recorded survey map. In this demo, upload a placeholder.'),
  ('environmental_assessment', 'Environmental impact assessment', 'An initial assessment under Executive Order 90-10, or a finding of no significant impact if Guam EPA accepts it. In this demo, upload a placeholder.'),
  ('sign_photo', 'Picture of the notice sign', 'In this demo, upload a placeholder.')
) as v(code, name, notes)
join public.application_types t on t.code = 'x_conditional_use'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_conditional_use'
where code = 'conditional-use-gluc-form-01' and application_type_code is null;

-- 2. Seashore clearance, decided by the Seashore Protection Commission and staffed by Land Management.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_seashore_clearance', 'Seashore clearance', id,
  'Unofficial tracker for a seashore clearance: the permit needed for any development in the seashore reserve. The reserve runs from 10 meters inland of the mean high water line out to the 10 fathom contour, with some exceptions (21 GCA §63103). The Commission must find no substantial harm to the environment, and the applicant has the burden of proof (21 GCA §63108). Some repairs to an existing house, up to $7,500, need no permit.',
  'clearance', true, true,
  'https://dlm.guam.gov/wp-dlm-content/uploads/2024/01/GSPC-Form-01_SeashoreClearance-2019-2020.pdf',
  '[
    {"key": "lot_block_and_tract", "label": "Lot, block, and tract numbers", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "village", "label": "Village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "where_in_the_reserve", "label": "Where the work is", "kind": "choice", "required": true, "help": null, "choices": ["On land within 10 meters of the high water mark", "In the water, out to the 10 fathom contour", "Both"]},
    {"key": "current_zone", "label": "Current zone", "kind": "choice", "required": true, "help": null, "choices": ["A", "R1", "R2", "P", "C", "M1", "M2", "LC", "H", "S-1", "PF"]},
    {"key": "proposed_development", "label": "Proposed development", "kind": "long", "required": true, "help": "The application asks for a one-page letter covering the seven findings in 21 GCA §63108, such as beach access, the view of the sea, and erosion.", "choices": []},
    {"key": "other_requests", "label": "Other Land Use or Seashore Commission requests on this lot", "kind": "text", "required": false, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'gspc'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Land Planning Division', 'dlm', 'intake', 'always', 10, 'Filed in person, by appointment only, with the Commission''s Executive Secretary at the Seashore Section, Land Planning Division. The form cannot be mailed. It asks for 32 sets of papers plus 9 electronic copies.'),
  ('s_arc_review', 'Application Review Committee review', 'arc', 'clearance', 'default_routed', 100, 'Land Management''s process chart for Land Use and Seashore applications shows a 60 calendar day agency review period. That chart is attached to the conditional use form, not the seashore form. Assumed for every seashore clearance here. Not confirmed.'),
  ('s_notice', 'Notice to nearby owners and the public', 'dlm', 'clearance', 'always', 110, 'The law makes the applicant pay notice costs for seashore clearance hearings (21 GCA §61303(d)). The form records newspaper and adjacent owner notice dates. The exact notice rules for a seashore clearance were not confirmed.'),
  ('s_public_hearing', 'Public hearing', 'gspc', 'clearance', 'always', 120, 'The hearing is set no less than 21 and no more than 90 days after filing (21 GCA §63108(b)).'),
  ('s_commission_decision', 'Commission decision', 'gspc', 'clearance', 'always', 130, 'The Commission acts within 60 days after the hearing ends. A permit needs a majority vote of the Board (21 GCA §63108). Anyone aggrieved can ask a court to review the decision within 60 days. Approval does not waive other permits, such as from the U.S. Army Corps of Engineers. In this tracker the review steps open together.'),
  ('fee_assessment', 'Fee assessment', 'dlm', 'fees', 'always', 900, 'No dollar amount is stored. The law sets a $75 seashore permit fee (21 GCA §63112), and the form lists a $75 filing fee. Notice costs are added (21 GCA §61303(d)). The real fee is due at filing. This tracker records it after review.'),
  ('tog_payment', 'Fee paid in person', 'dlm', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Seashore clearance issued', 'gspc', 'issuance', 'always', 920, 'The number shown is a demo number. The Commission sends a Notice of Action with any conditions.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_seashore_clearance'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, v.required, v.notes
from (values
  ('seashore_clearance_application', 'Seashore clearance application (GSPC Form 01)', true, 'With the one-page justification letter. In this demo, upload a placeholder.'),
  ('site_plan_and_maps', 'Site plan and maps', true, 'A site plan drawn to scale, a zoning map out to 1,000 ft, a map of buildings and uses out to 750 ft, a parcel map out to 500 ft, and the recorded survey map. In this demo, upload a placeholder.'),
  ('environmental_assessment', 'Environmental impact assessment', true, 'As required by the Guam Chief Planner. In this demo, upload a placeholder.'),
  ('erosion_control_plan', 'Erosion control plan', true, 'In this demo, upload a placeholder.'),
  ('lease_assignment', 'Lease assignment and covenant', false, 'Only if the land is leased. In this demo, upload a placeholder.')
) as v(code, name, required, notes)
join public.application_types t on t.code = 'x_seashore_clearance'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_seashore_clearance'
where code = 'seashore-clearance-gspc-form-01' and application_type_code is null;

-- 3. Business license renewal, led by Revenue and Taxation.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_business_license_renewal', 'Business license renewal', id,
  'Unofficial tracker for renewing a Guam business license. A license lasts one year from the date it was issued or renewed (11 GCA §70115). Most license types can be renewed online at GuamTax.com, except tobacco licenses. An expired license is renewed in person at Revenue and Taxation. A renewal is refused until every clearance flag on the license is cleared.',
  'license', true, true,
  'https://www.guamtax.com/help/help_biz.html',
  '[
    {"key": "business_name", "label": "Business name", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "kind_of_business", "label": "Kind of business", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "expires_on", "label": "When the current license expires", "kind": "text", "required": true, "help": "One year after it was issued or last renewed.", "choices": []},
    {"key": "same_premises", "label": "Is the business still at the same address?", "kind": "choice", "required": true, "help": "On the same premises, a renewal does not need a new zoning approval (11 GCA §70117).", "choices": ["Yes, same address", "No, it moved"]},
    {"key": "how_renewing", "label": "How you are renewing", "kind": "choice", "required": true, "help": "An expired license cannot be renewed online.", "choices": ["Online at GuamTax.com", "In person at Revenue and Taxation"]}
  ]'::jsonb
from public.agencies where code = 'drt'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Renewal application and sworn statement filed', 'drt', 'intake', 'always', 10, 'The renewal application is filed with a sworn statement, under penalty of perjury, that you still meet every condition the agencies certified for the original license (11 GCA §70117). Online renewal needs a GuamTax.com account and an existing license. We did not find a current paper renewal form.'),
  ('s_tax_clearance', 'Revenue and Taxation tax clearance', 'drt', 'clearance', 'always', 100, 'Income, business privilege, and withholding tax returns must be filed and the taxes paid, or a payment plan kept current (11 GCA §70132). GuamTax.com says each clearance flag is cleared directly with the Revenue and Taxation branch that set it. Which other clearances repeat on renewal is not published.'),
  ('s_zoning', 'Zoning approval for a new address', 'dlm', 'clearance', 'as_indicated', 110, 'Only if the business is not on the same premises as its last license (11 GCA §70117). Moving a business also uses the Revenue and Taxation relocation memorandum. How the two fit together was not confirmed.'),
  ('fee_assessment', 'Renewal fee assessment', 'drt', 'fees', 'always', 900, 'No dollar amount is stored. The renewal fee is the annual license fee (11 GCA §70117). A late renewal adds a penalty of $1.00 for each day it is late, which becomes part of the fee. A reviewer types the assessed amount.'),
  ('tog_payment', 'Renewal fee paid', 'drt', 'fees', 'always', 910, 'PermitGU does not take payment. GuamTax.com takes Visa, MasterCard, Discover, or American Express for online renewals, not checks.'),
  ('issue', 'License renewed', 'drt', 'issuance', 'always', 920, 'The number shown is a demo number. After an online renewal, the license record in your GuamTax.com account is updated. A business more than 30 days late must stop operating until it renews (11 GCA §70117).')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_business_license_renewal'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, v.required, v.notes
from (values
  ('renewal_sworn_statement', 'Renewal application with sworn statement', true, 'We did not find a current renewal form online. Confirm it with the Business License Branch. In this demo, upload a placeholder.'),
  ('clearance_information_sheet', 'Clearance Information sheet', false, 'Printed from your GuamTax.com account. It lists the clearance flags on the license. In this demo, upload a placeholder.')
) as v(code, name, required, notes)
join public.application_types t on t.code = 'x_business_license_renewal'
on conflict (application_type_id, code) do nothing;

-- This catalog row covers renewal, amendment, relocation, and cancellation together.
-- Linking it marks the whole row trackable, though only renewal is tracked.
update public.permit_catalog set trackable = true, application_type_code = 'x_business_license_renewal'
where code = 'business-license-renewal-amendment-relocation-cancellation' and application_type_code is null;
