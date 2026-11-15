-- Agency map and corrections inbox.

-- 1. A permit can touch several agencies. agency_code stays as the lead.
alter table public.permit_catalog add column if not exists agency_codes text[] not null default '{}';

update public.permit_catalog p set agency_codes = v.codes
from (values
  ('application-for-permit-and-plan-review-building-permit', array['dpw', 'dlm', 'gepa', 'gwa', 'gpa', 'gfd', 'dphss', 'clb', 'peals', 'dpr', 'doag', 'usace', 'ghpo', 'tog']),
  ('clearing-grading-stockpiling-permit-often-with-gepa', array['dpw', 'gepa']),
  ('certificate-of-occupancy', array['dpw']),
  ('zoning-examination-certification', array['dlm']),
  ('historic-preservation-certificate-of-approval', array['ghpo']),
  ('gwa-water-sewer-availability-connection-clearance', array['gwa']),
  ('gpa-power-clearance', array['gpa']),
  ('gepa-building-permit-wastewater-anods-review', array['gepa']),
  ('dphss-public-health-clearance-as-routed', array['dphss']),
  ('fire-prevention-bureau-plan-check-clearance', array['gfd']),
  ('contractor-s-license-board-clearance-as-routed', array['clb']),
  ('peals-stamp-registration-plans-by-pe-architect', array['peals']),
  ('flood-elevation-flood-control-review-if-in-flood-zone', array['dpw']),
  ('wetland-seashore-gluc-special-path-if-applicable', array['dlm', 'gluc', 'gspc', 'usace']),
  ('new-business-license-form-bl-01', array['drt', 'dlm', 'dpw', 'gfd', 'dphss', 'clb', 'gpd', 'gvb', 'dpr', 'gdoe']),
  ('good-moral-character-questionnaire', array['drt']),
  ('dba-fictitious-name-certificate', array['drt']),
  ('entity-registration-corp-llc-lp-nonprofit-foreign', array['drt']),
  ('name-reservation', array['drt']),
  ('business-license-renewal-amendment-relocation-cancellation', array['drt']),
  ('tobacco-products-license', array['drt']),
  ('martial-arts-registration', array['drt']),
  ('guam-trademark-service-mark', array['drt']),
  ('agency-clearances-on-bl-01-activity-specific-dlm-gvb-dpw-dpr-gfd-dphss-clb-gpd-c', array['drt', 'dlm', 'dpw', 'gfd', 'dphss', 'clb', 'gpd', 'gvb', 'dpr', 'gdoe']),
  ('sanitary-permit-form-a-new-establishment', array['dphss']),
  ('supplemental-form-b-food-establishment', array['dphss']),
  ('sanitary-permit-renewal', array['dphss']),
  ('temporary-food-service-establishment-tfse-sanitary-permit', array['dphss']),
  ('temporary-workforce-housing-sanitary-dormitory-permit', array['dphss']),
  ('chemical-toilet-sanitary-permit', array['dphss']),
  ('health-certificate-food-facility', array['dphss']),
  ('health-certificate-cosmetology-tattoo-therapeutic-massage', array['dphss']),
  ('health-certificate-institutional-child-care-nursing-home-etc', array['dphss']),
  ('health-certificate-laundry-dry-cleaning', array['dphss']),
  ('guam-controlled-substances-registration-individual-institutional', array['dphss']),
  ('pre-operational-inspection', array['dphss']),
  ('learner-s-permit-intermediate-full-driver-s-license', array['drt']),
  ('real-id-guam-id', array['drt']),
  ('vehicle-initial-registration-transfer', array['drt']),
  ('vehicle-registration-renewal', array['drt']),
  ('vehicle-safety-inspection-prerequisite', array['drt']),
  ('disabled-parking-placard-veteran-plates', array['drt']),
  ('motor-carrier-compliance-commercial', array['drt']),
  ('certification-of-zoning', array['dlm']),
  ('zone-change-gluc-form-02', array['gluc', 'dlm']),
  ('zone-variance-gluc-form-03', array['gluc', 'dlm']),
  ('conditional-use-gluc-form-01', array['gluc', 'dlm']),
  ('subdivision-variance-tentative-final-subdivision-forms-04-06', array['gluc', 'dlm']),
  ('tentative-development-plan-wetland-hpr-timeshare-forms-07-10', array['gluc', 'dlm']),
  ('seashore-clearance-gspc-form-01', array['gspc', 'dlm']),
  ('landweb-parcel-title-survey-searches', array['dlm']),
  ('certificate-of-title-recording', array['dlm']),
  ('real-property-tax-matters', array['drt']),
  ('chamorro-land-trust-ancestral-lands-actions', array['cltc', 'galc']),
  ('clearing-grubbing-grading-stockpiling', array['gepa', 'dpw']),
  ('soil-sand-aggregate-importation', array['gepa']),
  ('section-401-water-quality-certification-401a-b-c', array['gepa']),
  ('well-drilling-well-operating-uic-test-boring', array['gepa']),
  ('well-driller-s-license-limited-unlimited', array['gepa']),
  ('residential-commercial-holding-tank-type-4-anods', array['gepa']),
  ('air-pollution-construction-standby-generator-emission-unit', array['gepa']),
  ('solid-waste-collection-hardfill-landfill-processing-storage-transfer', array['gepa']),
  ('ust-hazardous-waste-notification-rcra', array['gepa']),
  ('pesticide-notice-of-arrival-restricted-use-licenses-noi', array['gepa']),
  ('water-wastewater-operator-certification', array['gepa']),
  ('burial-at-sea-request', array['gepa']),
  ('burning-permit', array['gfd', 'gepa']),
  ('federal-consistency-coastal-management', array['bsp']),
  ('usace-wetlands-navigable-waters-federal', array['usace']),
  ('operations-permit', array['gfd']),
  ('gfd-permit-application-application-for-permit', array['gfd']),
  ('fire-prevention-plan-review-building', array['gfd']),
  ('gfd-fee-schedule', array['gfd']),
  ('self-inspection-form', array['gfd']),
  ('contractor-s-license', array['clb']),
  ('professional-engineer-architect-land-surveyor', array['peals']),
  ('cpa-accountancy', array['gboa']),
  ('real-estate-broker-salesperson', array['guamrealestatecommission']),
  ('educator-certification', array['gcec']),
  ('physicians-board-of-medical-examiners', array['dphss', 'hplo']),
  ('nurses-board-of-nurse-examiners', array['dphss', 'hplo']),
  ('pharmacy-dentistry-optometry-allied-health-ems-social-work-barbering-cosmetology', array['dphss', 'hplo']),
  ('attorney-admission', array['judiciary']),
  ('alcoholic-beverage-licenses-import-manufacture-on-off-sale-etc', array['drt', 'abcboard']),
  ('fund-raising-event-application', array['drt']),
  ('temporary-food-event-sanitary-permits', array['dphss']),
  ('village-mayor-mcog-event-clearances', array['mcog']),
  ('tobacco-products-license-87', array['drt']),
  ('birth-death-marriage-certificates', array['dphss']),
  ('driver-s-license-real-id-guam-id', array['drt']),
  ('business-privilege-tax-accounts-grt', array['drt']),
  ('treasurer-of-guam-fee-payments-blpc-cashier', array['tog', 'doa']),
  ('guam-solid-waste-authority-service-related', array['gswa']),
  ('customs-related-clearances', array['cqa']),
  ('police-clearances-as-required-on-some-licenses', array['gpd'])
) as v(code, codes)
where p.code = v.code;

-- Rows added by hand in the admin page keep their one agency.
update public.permit_catalog set agency_codes = array[agency_code]
where agency_codes = '{}' and agency_code is not null;

-- 2. Corrections sent from the guide pages. Anyone can send one. Only a super
-- admin who has passed the second factor can read them.
create table if not exists public.contributions (
  id bigint generated always as identity primary key,
  topic text not null check (char_length(topic) between 1 and 160),
  detail text not null check (char_length(detail) between 1 and 3000),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  status text not null default 'new' check (status in ('new', 'reviewed', 'used', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.contributions enable row level security;
alter table public.contributions force row level security;
revoke all on public.contributions from public, anon, authenticated;
grant select on public.contributions to authenticated;

drop policy if exists contributions_read on public.contributions;
create policy contributions_read on public.contributions for select to authenticated
using (private.aal() = 'aal2' and private.is_super_admin());

create or replace function private.submit_contribution(p_topic text, p_detail text, p_source text, p_contact text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topic text := btrim(coalesce(p_topic, ''));
  v_detail text := btrim(coalesce(p_detail, ''));
  v_source text := nullif(btrim(coalesce(p_source, '')), '');
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
  v_id bigint;
begin
  if v_topic = '' or v_detail = '' then raise exception 'not_ready'; end if;
  if char_length(v_topic) > 160 or char_length(v_detail) > 3000 then raise exception 'too_long'; end if;
  if v_source is not null and (char_length(v_source) > 2000 or v_source !~* '^https?://') then raise exception 'bad_source'; end if;
  if v_contact is not null and char_length(v_contact) > 200 then raise exception 'too_long'; end if;
  -- A flood guard for the whole table. The web route also limits each address.
  if (select count(*) from public.contributions where created_at > now() - interval '1 day') >= 300 then
    raise exception 'inbox_full';
  end if;
  insert into public.contributions (topic, detail, source_url, contact)
  values (v_topic, v_detail, v_source, v_contact)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_contribution(p_topic text, p_detail text, p_source text, p_contact text)
returns bigint
language sql
-- Runs as its owner so anonymous visitors never need access to the private schema.
security definer
set search_path = ''
as $$ select private.submit_contribution(p_topic, p_detail, p_source, p_contact) $$;

create or replace function private.set_contribution_status(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.aal() <> 'aal2' or not private.is_super_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('new', 'reviewed', 'used', 'dismissed') then raise exception 'bad_status'; end if;
  update public.contributions set status = p_status where id = p_id;
  if not found then raise exception 'not_found'; end if;
end;
$$;

create or replace function public.set_contribution_status(p_id bigint, p_status text)
returns void
language sql
set search_path = ''
as $$ select private.set_contribution_status(p_id, p_status) $$;

revoke all on function public.submit_contribution(text, text, text, text) from public;
revoke all on function public.set_contribution_status(bigint, text) from public, anon;
revoke all on function private.submit_contribution(text, text, text, text) from public, anon, authenticated;
revoke all on function private.set_contribution_status(bigint, text) from public, anon, authenticated;
grant execute on function public.submit_contribution(text, text, text, text) to anon, authenticated;
grant execute on function public.set_contribution_status(bigint, text) to authenticated;
grant execute on function private.set_contribution_status(bigint, text) to authenticated;
