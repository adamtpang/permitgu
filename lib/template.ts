export const APPLICATION_TYPE = {
  code: "building_permit_residential_one_family",
  name: "Residential building permit, private one-family new build",
  leadAgency: "dpw",
  summary:
    "Unofficial tracker for a private one-family house on public sewer. Wetland, seashore, GLUC, and septic paths are out of this flow.",
} as const;

export const AGENCIES = [
  { code: "dpw", acronym: "DPW", name: "Department of Public Works", website: "https://dpw.guam.gov/blpc/" },
  { code: "dlm", acronym: "DLM", name: "Department of Land Management", website: "https://dlm.guam.gov/" },
  { code: "gepa", acronym: "GEPA", name: "Guam Environmental Protection Agency", website: "https://epa.guam.gov/applications/" },
  { code: "gwa", acronym: "GWA", name: "Guam Waterworks Authority", website: "https://dpw.guam.gov/blpc/" },
  { code: "gpa", acronym: "GPA", name: "Guam Power Authority", website: "https://dpw.guam.gov/blpc/" },
  { code: "gfd", acronym: "GFD", name: "Guam Fire Department", website: "https://gfd.guam.gov/forms/" },
  { code: "dphss", acronym: "DPHSS", name: "Department of Public Health and Social Services", website: "https://dphss.guam.gov/" },
  { code: "clb", acronym: "CLB", name: "Contractors License Board", website: "https://clb.guam.gov/" },
  { code: "peals", acronym: "PEALS", name: "PEALS Board", website: "https://peals.guam.gov/" },
  { code: "dpr", acronym: "DPR", name: "Department of Parks and Recreation", website: "https://dpw.guam.gov/blpc/" },
  { code: "doag", acronym: "DoAg", name: "Department of Agriculture", website: "https://dpw.guam.gov/blpc/" },
  { code: "usace", acronym: "USACE", name: "U.S. Army Corps of Engineers", website: "https://bsp.guam.gov/guam-development-guidebook/" },
  { code: "ghpo", acronym: "GHPO", name: "Guam Historic Preservation Office", website: "https://www.territorialreview.org/statute/21-gca-76511" },
  { code: "tog", acronym: "TOG", name: "Treasurer of Guam", website: "https://dpw.guam.gov/blpc/" },
] as const;

export type AgencyCode = (typeof AGENCIES)[number]["code"];
export type Phase = "intake" | "plan_review" | "clearance" | "fees" | "issuance" | "inspection" | "occupancy";
export type Routing = "always" | "default_routed" | "as_indicated" | "gated" | "provisional";

export type StepTemplate = {
  code: string;
  name: string;
  agency: AgencyCode;
  phase: Phase;
  routing: Routing;
  sort: number;
  uncertainty: string | null;
};

const AS_INDICATED =
  "Listed on the DPW application as a clearance to route as indicated. Not confirmed as always required for a private one-family house on public sewer.";

export const STEPS: StepTemplate[] = [
  {
    code: "dpw_intake",
    name: "DPW intake",
    agency: "dpw",
    phase: "intake",
    routing: "always",
    sort: 10,
    uncertainty: null,
  },
  {
    code: "dpw_architectural",
    name: "Architectural plan review",
    agency: "dpw",
    phase: "plan_review",
    routing: "default_routed",
    sort: 20,
    uncertainty:
      "Assumed for a new one-family building. The DPW form treats plan-review disciplines as indicated. Confirm with DPW before treating this as always required.",
  },
  {
    code: "dpw_structural",
    name: "Structural plan review",
    agency: "dpw",
    phase: "plan_review",
    routing: "default_routed",
    sort: 30,
    uncertainty:
      "Assumed for a new one-family building. The DPW form treats plan-review disciplines as indicated. Confirm with DPW before treating this as always required.",
  },
  {
    code: "dpw_mechanical_plumbing",
    name: "Mechanical and plumbing plan review",
    agency: "dpw",
    phase: "plan_review",
    routing: "as_indicated",
    sort: 40,
    uncertainty: "DPW plan-review discipline. Route only if it applies. Not default-routed on this template.",
  },
  {
    code: "dpw_flood_control",
    name: "Flood control review",
    agency: "dpw",
    phase: "plan_review",
    routing: "as_indicated",
    sort: 50,
    uncertainty: "On the DPW plan-review list. Route when the lot is in a flood zone. Not default-routed.",
  },
  {
    code: "dpw_hpcc",
    name: "HPCC plan review",
    agency: "dpw",
    phase: "plan_review",
    routing: "as_indicated",
    sort: 60,
    uncertainty:
      "Printed as HPCC on the DPW plan-review list used for this template. The expansion of that acronym is not confirmed here.",
  },
  {
    code: "dpw_hydraulics_civil",
    name: "Hydraulics and civil plan review",
    agency: "dpw",
    phase: "plan_review",
    routing: "as_indicated",
    sort: 70,
    uncertainty: "DPW plan-review discipline. Route only if it applies. Not default-routed on this template.",
  },
  {
    code: "dpw_highway_row",
    name: "Highway, right-of-way, and traffic review",
    agency: "dpw",
    phase: "plan_review",
    routing: "as_indicated",
    sort: 80,
    uncertainty: "DPW plan-review discipline. Route only if the work touches a road or right of way. Not default-routed.",
  },
  {
    code: "dlm_zoning",
    name: "Zoning examination",
    agency: "dlm",
    phase: "clearance",
    routing: "always",
    sort: 90,
    uncertainty: null,
  },
  {
    code: "gepa_review",
    name: "GEPA building-permit review",
    agency: "gepa",
    phase: "clearance",
    routing: "as_indicated",
    sort: 100,
    uncertainty:
      "GEPA reviews building permits and wastewater. This flow is public sewer only, not septic or ANODS. Whether GEPA is always routed for a sewered one-family house is not confirmed, so it is not default-routed.",
  },
  {
    code: "gwa_availability",
    name: "GWA water and sewer availability",
    agency: "gwa",
    phase: "clearance",
    routing: "default_routed",
    sort: 110,
    uncertainty:
      "Default-routed because this flow assumes public water and public sewer. Confirm with DPW and GWA for a typical house.",
  },
  {
    code: "gpa_clearance",
    name: "GPA power clearance",
    agency: "gpa",
    phase: "clearance",
    routing: "as_indicated",
    sort: 120,
    uncertainty: AS_INDICATED,
  },
  {
    code: "gfd_fire",
    name: "Fire Prevention plan check",
    agency: "gfd",
    phase: "clearance",
    routing: "as_indicated",
    sort: 130,
    uncertainty: AS_INDICATED,
  },
  {
    code: "dphss_clearance",
    name: "Public Health clearance",
    agency: "dphss",
    phase: "clearance",
    routing: "as_indicated",
    sort: 140,
    uncertainty: AS_INDICATED,
  },
  {
    code: "clb_clearance",
    name: "Contractors License Board clearance",
    agency: "clb",
    phase: "clearance",
    routing: "as_indicated",
    sort: 150,
    uncertainty: AS_INDICATED,
  },
  {
    code: "peals_stamp",
    name: "PEALS registration check",
    agency: "peals",
    phase: "clearance",
    routing: "as_indicated",
    sort: 160,
    uncertainty: "The DPW form asks for an architect or engineer seal number as required. PEALS registration is not confirmed as its own clearance on every house.",
  },
  {
    code: "dpr_clearance",
    name: "Parks and Recreation clearance",
    agency: "dpr",
    phase: "clearance",
    routing: "as_indicated",
    sort: 170,
    uncertainty: AS_INDICATED,
  },
  {
    code: "agriculture_clearance",
    name: "Agriculture clearance",
    agency: "doag",
    phase: "clearance",
    routing: "as_indicated",
    sort: 180,
    uncertainty: AS_INDICATED,
  },
  {
    code: "usace_clearance",
    name: "USACE clearance",
    agency: "usace",
    phase: "clearance",
    routing: "as_indicated",
    sort: 190,
    uncertainty:
      "Listed on the DPW application. A private one-family house on public sewer with no wetland or seashore work is assumed not to need USACE. That is not an official determination.",
  },
  {
    code: "historic_preservation",
    name: "Historic preservation certificate of approval",
    agency: "ghpo",
    phase: "clearance",
    routing: "gated",
    sort: 200,
    uncertainty:
      "21 GCA §76511 requires a certificate of approval when it applies. When it is N/A for a typical house is not confirmed. Staff can mark this step n/a with a reason. It does not block other clearances while it is not started.",
  },
  {
    code: "fee_assessment",
    name: "Fee assessment",
    agency: "dpw",
    phase: "fees",
    routing: "always",
    sort: 210,
    uncertainty:
      "No dollar amount is stored on the template. Staff enter the assessed amount on the application. The published dollar schedule is not confirmed.",
  },
  {
    code: "tog_payment",
    name: "In-person payment at Treasurer of Guam",
    agency: "tog",
    phase: "fees",
    routing: "always",
    sort: 220,
    uncertainty: "Paid in person at the BLPC cashier. Permit GU does not take payment online.",
  },
  {
    code: "dpw_issue_permit",
    name: "Issue building permit",
    agency: "dpw",
    phase: "issuance",
    routing: "always",
    sort: 230,
    uncertainty: "The permit number this demo assigns is not an official DPW number.",
  },
  {
    code: "insp_foundation",
    name: "Foundation inspection",
    agency: "dpw",
    phase: "inspection",
    routing: "provisional",
    sort: 240,
    uncertainty: "Provisional. The DPW Director sets the inspection list (21 GCA §66403). Foundation, framing, and final are a placeholder, not a confirmed home checklist.",
  },
  {
    code: "insp_framing",
    name: "Framing inspection",
    agency: "dpw",
    phase: "inspection",
    routing: "provisional",
    sort: 250,
    uncertainty: "Provisional. The DPW Director sets the inspection list (21 GCA §66403). Not confirmed as DPW's current home checklist.",
  },
  {
    code: "insp_final",
    name: "Final inspection",
    agency: "dpw",
    phase: "inspection",
    routing: "provisional",
    sort: 260,
    uncertainty: "Provisional. The DPW Director sets the inspection list (21 GCA §66403). Not confirmed as DPW's current home checklist.",
  },
  {
    code: "certificate_of_occupancy",
    name: "Certificate of occupancy",
    agency: "dpw",
    phase: "occupancy",
    routing: "always",
    sort: 270,
    uncertainty: null,
  },
];

export const OPEN_QUESTIONS = [
  "Who are the named pilot contacts at DPW Building Inspection / BLPC, and ideally at DLM and one clearance agency?",
  "For a typical private one-family house on public sewer, which agencies are always routed, and when is historic preservation N/A?",
  "What is DPW's current inspection checklist for a typical home?",
  "Does GovGuam counsel have a retention rule that overrides the 7-year application / 10-year audit recommendation?",
  "Is an unofficial pilot acceptable while the paper application stays authoritative?",
];

export const PIPELINE = [
  "draft",
  "submitted",
  "intake",
  "plan_review",
  "clearances_in_progress",
  "fees_due",
  "issued",
  "inspections",
  "occupancy_issued",
] as const;

export const PIPELINE_LABEL: Record<(typeof PIPELINE)[number], string> = {
  draft: "Draft",
  submitted: "Submitted",
  intake: "Intake",
  plan_review: "Plan review",
  clearances_in_progress: "Clearances",
  fees_due: "Fees due",
  issued: "Issued",
  inspections: "Inspections",
  occupancy_issued: "Occupancy",
};
