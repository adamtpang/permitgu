-- Three more permits made with the permit builder.
-- Researched 2026-11-15:
--   Contractor's license: the Contractors License Board application packet dated
--     April 25, 2024, and 21 GCA Chapter 70.
--   Health certificate: the Public Health food safety course study manual, plus a
--     May 2022 Pacific Daily News report for the steps and fee (marked as not confirmed).
--   Zone change: 21 GCA Chapter 61 and the Land Management paper, as on the /zoning guide.

-- 1. Contractor's license, led by the Contractors License Board.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_contractor_license', 'Contractor''s license', id,
  'Unofficial tracker for a new contractor''s license: the examination, the agency clearances, and the Board''s decision. An applicant needs at least four years of experience in the last ten as a foreman, supervising employee, or contractor in the same field, and must be 18 or older. A company qualifies through its Responsible Management Employee.',
  'license', true, true,
  'http://clb.guam.gov/wp-content/uploads/2024/04/Application-Information-Packet-2024-04-25.pdf',
  '[
    {"key": "applicant_or_company", "label": "Applicant or company", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "kind_of_license", "label": "Kind of license", "kind": "choice", "required": true, "help": "A partnership application is signed by all partners. A corporation''s is signed by two thirds of its officers.", "choices": ["Sole proprietor", "Partnership", "Corporation"]},
    {"key": "classification", "label": "Classification applied for", "kind": "text", "required": true, "help": "For example C13, electrical. Each classification has its own examination part.", "choices": []},
    {"key": "experience", "label": "Your experience in this field", "kind": "long", "required": true, "help": "At least four years in the last ten. Training can count for no more than one year.", "choices": []},
    {"key": "responsible_management_employee", "label": "Responsible Management Employee", "kind": "text", "required": false, "help": "For a partnership or corporation: the person who qualifies the company.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'clb'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Application for Examination filed', 'clb', 'intake', 'always', 10, 'Filed with three certificates of experience, sworn statements from two persons, a financial statement, and a project listing. Proof of citizenship and the bank letter are shown to the Board as originals. Do not upload them to this demo. You are scheduled for the examination when you file and pay.'),
  ('s_examination', 'Examination, two parts', 'clb', 'clearance', 'always', 100, 'Part I covers the law as applied to construction. Part II covers the classification applied for. The passing score is 75% or higher on each part. In this tracker the review steps open together. The real order is the examination, then the clearances, then the Board.'),
  ('s_revenue_and_taxation', 'Revenue and Taxation clearance', 'drt', 'clearance', 'always', 110, 'After passing, four sections clear the license application: Business License, Gross Receipts Tax, Income Tax Assistance, and Collection.'),
  ('s_labor', 'Department of Labor clearance', 'dol', 'clearance', 'always', 120, 'After passing, five sections clear the license application: Workers'' Compensation, Wage and Hour, Labor Statistics, Alien Labor Processing and Certification, and OSHA.'),
  ('s_zone_clearance', 'Zone clearance', 'dlm', 'clearance', 'always', 130, 'One clearance from Land Management. The packet advises bringing proof of ownership of the lot or written authorization from the owner.'),
  ('s_building_permits', 'Public Works clearance', 'dpw', 'clearance', 'always', 140, 'Obtained from the Building Permits Section.'),
  ('s_public_health', 'Public Health clearance', 'dphss', 'clearance', 'as_indicated', 150, 'Only if you have alien labor in your work force, to check that housing meets minimum requirements.'),
  ('s_peals_board', 'PEALS Board clearance', 'peals', 'clearance', 'as_indicated', 160, 'Only for classification A.'),
  ('s_board_decision', 'Board investigation and decision', 'clb', 'clearance', 'always', 170, 'The Board investigates every application, then issues the license or says in writing why not. The license application also needs a copy of the construction contract the company will use.'),
  ('fee_assessment', 'License fee assessment', 'clb', 'fees', 'always', 900, 'No dollar amount is stored. The application fee is $50 for each examination part and is paid at filing. A new license fee is pro-rated by quarter: $400 from July, $300 from October, $200 from January, $100 from April. A reviewer types the assessed amount.'),
  ('tog_payment', 'License fee paid in person', 'clb', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'License issued', 'clb', 'issuance', 'always', 920, 'The number shown is a demo number. It is not a Contractors License Board license number. The annual fee is due on or before June 30 each year.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_contractor_license'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, v.required, v.notes
from (values
  ('application_for_examination', 'Application for Examination', true, 'From the Board''s application packet.'),
  ('experience_certificates', 'Certificates in support of experience', true, 'Three of them. The Board needs the originals.'),
  ('sworn_statements', 'Sworn statements from two persons', true, 'From people who know your reputation for honesty and fair dealing. The Board needs the originals.'),
  ('project_listing', 'Project listing', true, 'One for each classification applied for.'),
  ('construction_contract', 'Copy of the construction contract you will use', false, 'Filed with the license application after you pass.')
) as v(code, name, required, notes)
join public.application_types t on t.code = 'x_contractor_license'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_contractor_license'
where code = 'contractor-s-license' and application_type_code is null;

-- 2. Health certificate for a food worker, led by Public Health.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_health_certificate_food', 'Health certificate for a food worker', id,
  'Unofficial tracker for the health certificate each person handling food needs. The course examination has 25 multiple choice questions and a passing score of 70%. The steps and fee here come from a May 2022 news report and are not confirmed as current. Confirm with Environmental Health at (671) 922-2533.',
  'certificate', true, true,
  'https://dphss.guam.gov/sites/default/files/Attachment-E1-HC-Food-Safety-Course-Study-Manual-English.pdf',
  '[
    {"key": "your_name", "label": "Your name", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "where_you_work", "label": "Where you handle food", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "first_time_or_renewal", "label": "First time or renewal", "kind": "choice", "required": true, "help": "A 2022 report says a first-time applicant takes the food safety course and a renewal takes a refresher course.", "choices": ["First time", "Renewal"]},
    {"key": "language_for_the_course", "label": "Language you want for the study manual", "kind": "text", "required": false, "help": "Public Health has published the study manual in six languages.", "choices": []}
  ]'::jsonb
from public.agencies where code = 'dphss'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Application at the processing center', 'dphss', 'intake', 'always', 10, 'A 2022 report says a first-time applicant shows the result of a tuberculosis skin test taken in the last six months. Do not upload a test result to this demo. Show it at the processing center. Where the center is now is not confirmed.'),
  ('s_food_safety_course', 'Food safety course and examination', 'dphss', 'clearance', 'default_routed', 100, 'The examination has 25 multiple choice questions and a passing score of 70%. A 2022 report says the processing center schedules the course. Not confirmed as current.'),
  ('fee_assessment', 'Fee assessment', 'dphss', 'fees', 'always', 900, 'No dollar amount is stored. A May 2022 news report lists $25 for a food worker: $10 for the certificate and $15 for the course. Not confirmed as current. A reviewer types the assessed amount.'),
  ('tog_payment', 'Fee paid in person', 'dphss', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Health certificate issued', 'dphss', 'issuance', 'always', 920, 'The number shown is a demo number. How long a certificate stays valid was not in the sources we found.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_health_certificate_food'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, 'health_certificate_application', 'Health certificate application', true, 'The food facility application linked from the permit center resources page is a 2018 copy. Confirm the current one with Environmental Health.'
from public.application_types t where t.code = 'x_health_certificate_food'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_health_certificate_food'
where code = 'health-certificate-food-facility' and application_type_code is null;

-- 3. Zone change, filed with Land Management and decided by the Land Use Commission.
insert into public.application_types (code, name, lead_agency_id, summary, noun, active, builder, source, fields)
select 'x_zone_change', 'Zone change', id,
  'Unofficial tracker for a zone change: asking the Guam Land Use Commission to rezone land. Any owner or lessee in the area can apply. The Commission must find that public necessity, convenience, and general welfare justify it. The faster summary zone change for A and R1 land is a different path and is not tracked here.',
  'approval', true, true,
  'https://dlm.guam.gov/wp-dlm-content/uploads/2025/01/8b.-GLUC-Form-02_ZoneChange-2025.pdf',
  '[
    {"key": "lot_block_and_tract", "label": "Lot, block, and tract numbers", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "village", "label": "Village", "kind": "text", "required": true, "help": null, "choices": []},
    {"key": "current_zone", "label": "Current zone", "kind": "choice", "required": true, "help": null, "choices": ["A", "R1", "R2", "P", "C", "M1", "M2", "LC", "H", "S-1", "PF"]},
    {"key": "zone_requested", "label": "Zone requested", "kind": "choice", "required": true, "help": null, "choices": ["A", "R1", "R2", "P", "C", "M1", "M2", "LC", "H", "S-1", "PF"]},
    {"key": "justification", "label": "Why the change is justified", "kind": "long", "required": true, "help": "The application asks for a one-page justification letter.", "choices": []},
    {"key": "certificate_of_title_number", "label": "Certificate of title number", "kind": "text", "required": false, "help": null, "choices": []}
  ]'::jsonb
from public.agencies where code = 'dlm'
on conflict (code) do nothing;

insert into public.workflow_steps (application_type_id, code, name, agency_id, phase, routing, sort_order, uncertainty)
select t.id, v.code, v.name, a.id, v.phase, v.routing, v.sort_order, v.uncertainty
from (values
  ('intake', 'Intake at the Division of Planning', 'dlm', 'intake', 'always', 10, 'Filed with the Commission''s Executive Secretary, care of the Land Management Division of Planning.'),
  ('s_notice_sign', 'Notice sign posted on the lot', 'dlm', 'clearance', 'always', 100, 'A sign at least 4 ft by 8 ft reading "Notice to Rezone" goes up within 5 days of filing (21 GCA §61633).'),
  ('s_mailed_and_newspaper_notice', 'Mailed and newspaper notice', 'dlm', 'clearance', 'always', 110, 'Owners within 500 ft are notified, a newspaper notice runs at least 10 days before the hearing, and the village mayor is told. Missing a notice step makes any approval null and void (21 GCA §61633).'),
  ('s_arc_review', 'Application Review Committee review', 'arc', 'clearance', 'default_routed', 120, 'Land Management agendas show the committee setting a 30-day timeline once an application is on its agenda. Assumed for every zone change here. Not confirmed as a rule.'),
  ('s_public_hearing', 'Public hearing', 'gluc', 'clearance', 'always', 130, 'The Commission holds a hearing after the notices run.'),
  ('s_commission_decision', 'Commission decision', 'gluc', 'clearance', 'always', 140, 'The Commission decides within 40 days of the hearing (21 GCA §61634). In this tracker the review steps open together. The real order runs from the sign to the Governor.'),
  ('s_governor', 'Governor''s approval', 'gov', 'clearance', 'always', 150, 'An approved zone change goes to the Governor (21 GCA §61634).'),
  ('fee_assessment', 'Fee assessment', 'dlm', 'fees', 'always', 900, 'No dollar amount is stored. The law sets a $50 filing fee for a zone change, plus the cost of mailing notices and the newspaper notice (21 GCA §61660). The real fee is due at filing. This tracker records it after review.'),
  ('tog_payment', 'Fee paid in person', 'dlm', 'fees', 'always', 910, 'PermitGU does not take payment.'),
  ('issue', 'Zone change recorded', 'dlm', 'issuance', 'always', 920, 'The number shown is a demo number. An approved change is recorded at Land Management and Public Works. The law names no appeal route for a denied zone change.')
) as v(code, name, agency, phase, routing, sort_order, uncertainty)
join public.application_types t on t.code = 'x_zone_change'
join public.agencies a on a.code = v.agency
on conflict (application_type_id, code) do nothing;

insert into public.required_documents (application_type_id, code, name, required, notes)
select t.id, v.code, v.name, true, v.notes
from (values
  ('zone_change_application', 'Zone change application (GLUC Form 02)', 'With the one-page justification letter.'),
  ('maps_and_plans', 'Maps and plans', 'A zoning map out to 1,000 ft, a land-use map out to 750 ft, a parcel map out to 500 ft, the recorded property map, and an as-built plan.')
) as v(code, name, notes)
join public.application_types t on t.code = 'x_zone_change'
on conflict (application_type_id, code) do nothing;

update public.permit_catalog set trackable = true, application_type_code = 'x_zone_change'
where code = 'zone-change-gluc-form-02' and application_type_code is null;
