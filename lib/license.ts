// The second tracked permit: a new general business license, led by the Department
// of Revenue and Taxation. Steps come from Form BL-01 and 11 GCA Chapter 70.
// The house permit lives in lib/template.ts.

import { APPLICATION_TYPE, PIPELINE, PIPELINE_LABEL, type Phase, type Routing } from "./template";

export const BL01_URL = "https://www.guamtax.com/notices/FORMBL-01NEWBUSINESSLICENSEAPPLICATION.pdf";
export const BL_PROCEDURE_URL = "https://www.govguamdocs.com/revtax/docs/PROCEDURESANDREQUIREMENTSFORNEWBL.pdf";
export const BL_LAW_URL = "https://col.guamcourts.gov/sites/default/files/11gc070.pdf";

export const LICENSE_TYPE = {
  code: "business_license_new",
  name: "New general business license",
  leadAgency: "drt",
  summary:
    "Unofficial tracker for a new general business license. It follows Form BL-01 through Revenue and Taxation and the agencies that clear it. Renewals, liquor, tobacco, and professional licenses are out of this flow.",
} as const;

export type LicenseStep = {
  code: string;
  name: string;
  agency: string;
  phase: Phase;
  routing: Routing;
  sort: number;
  uncertainty: string | null;
};

const TAX = "11 GCA §70132 requires this clearance before any license is issued or renewed.";
const BOX =
  "A clearance box on Form BL-01. Revenue and Taxation ticks it when it applies. No public list says which business types need it, so it stays off until a reviewer routes it.";

export const LICENSE_STEPS: LicenseStep[] = [
  { code: "bl_intake", name: "Intake: Form BL-01, questionnaire, and photo ID", agency: "drt", phase: "intake", routing: "always", sort: 10, uncertainty: "The General Licensing and Registration Branch checks that the location and activity are complete. An incomplete location is rejected." },
  { code: "bl_grt", name: "Business privilege tax clearance", agency: "drt", phase: "clearance", routing: "always", sort: 20, uncertainty: TAX },
  { code: "bl_income_tax", name: "Income tax and withholding clearance", agency: "drt", phase: "clearance", routing: "always", sort: 30, uncertainty: TAX },
  { code: "bl_collections", name: "Collections clearance", agency: "drt", phase: "clearance", routing: "always", sort: 40, uncertainty: TAX },
  { code: "bl_dlm_zoning", name: "Zoning and ownership clearance", agency: "dlm", phase: "clearance", routing: "default_routed", sort: 50, uncertainty: "For a new license, Land Management checks that the use fits the zone and that the applicant owns or may use the premises. Assumed for every new license in this flow. Not confirmed as a rule for every business type." },
  { code: "bl_dpw", name: "Public Works clearance", agency: "dpw", phase: "clearance", routing: "as_indicated", sort: 60, uncertainty: BOX },
  { code: "bl_gfd", name: "Fire Department clearance", agency: "gfd", phase: "clearance", routing: "as_indicated", sort: 70, uncertainty: BOX },
  { code: "bl_dphss", name: "Public Health clearance", agency: "dphss", phase: "clearance", routing: "as_indicated", sort: 80, uncertainty: "A clearance box on Form BL-01. It applies to a business that needs a sanitary permit, such as food service. It stays off until a reviewer routes it." },
  { code: "bl_clb", name: "Contractors License Board clearance", agency: "clb", phase: "clearance", routing: "as_indicated", sort: 90, uncertainty: BOX },
  { code: "bl_gpd", name: "Police Department clearance", agency: "gpd", phase: "clearance", routing: "as_indicated", sort: 100, uncertainty: BOX },
  { code: "bl_gvb", name: "Visitors Bureau clearance", agency: "gvb", phase: "clearance", routing: "as_indicated", sort: 110, uncertainty: BOX },
  { code: "bl_dpr", name: "Parks and Recreation clearance", agency: "dpr", phase: "clearance", routing: "as_indicated", sort: 120, uncertainty: BOX },
  { code: "bl_gdoe", name: "Department of Education clearance", agency: "gdoe", phase: "clearance", routing: "as_indicated", sort: 130, uncertainty: BOX },
  { code: "fee_assessment", name: "Fee assessment", agency: "drt", phase: "fees", routing: "always", sort: 200, uncertainty: "No dollar amount is stored. The only published schedule is dated March 2013. A reviewer types the assessed amount." },
  { code: "tog_payment", name: "Fee paid in person", agency: "drt", phase: "fees", routing: "always", sort: 210, uncertainty: "Revenue and Taxation contacts the applicant for pickup and fees once every clearance is endorsed. PermitGU does not take payment." },
  { code: "bl_issue", name: "License issued", agency: "drt", phase: "issuance", routing: "always", sort: 220, uncertainty: "The number shown is a demo number. It is not a Revenue and Taxation license number." },
];

export const ENTITY_TYPES = [
  { value: "sole_proprietor", label: "Sole proprietor" },
  { value: "corporation", label: "Corporation" },
  { value: "llc", label: "Limited liability company" },
  { value: "partnership", label: "Partnership" },
] as const;

export type LicenseInput = {
  businessName: string;
  tradeName: string;
  entityType: string;
  registrationNumber: string;
  activity: string;
  lot: string;
  block: string;
  street: string;
  village: string;
  attestation: boolean;
  attestationName: string;
};

const TOO_LONG = "One of the fields is too long.";

export function validateLicense(input: LicenseInput, mode: "save" | "submit") {
  const values = [input.businessName, input.tradeName, input.registrationNumber, input.lot, input.block, input.street, input.village, input.attestationName];
  if (values.some((value) => value.length > 200) || input.activity.length > 2000) return TOO_LONG;
  if (!input.businessName.trim()) return "Enter the business name.";
  if (!ENTITY_TYPES.some((entity) => entity.value === input.entityType)) return "Choose the kind of business.";
  if (mode === "save") return null;
  if (!input.activity.trim()) return "Describe the business activity, such as: Retail, sale of clothing.";
  if (!input.lot.trim() || !input.block.trim() || !input.street.trim() || !input.village.trim()) {
    return "Enter the lot number, block number, street address, and village. Form BL-01 says an application without them is rejected.";
  }
  if (input.entityType !== "sole_proprietor" && !input.registrationNumber.trim()) {
    return "Enter the entity registration number. A corporation, company, or partnership registers with Revenue and Taxation before a license is issued.";
  }
  if (!input.attestation || !input.attestationName.trim()) return "Check the attestation and enter the name for it.";
  return null;
}

export const LICENSE_DOCUMENTS = [
  { code: "bl01", name: "Signed Form BL-01", notes: "Signed by hand and dated. Revenue and Taxation does not accept a digital signature." },
  { code: "good_moral", name: "Good Moral Character Questionnaire", notes: "Filed with Form BL-01." },
] as const;

export const LICENSE_PIPELINE = ["draft", "submitted", "intake", "clearances_in_progress", "fees_due", "issued"] as const;

// A permit built in the admin page (lib/permit-types.ts), as far as these helpers need it.
export type BuiltInfo = {
  builder: boolean;
  name: string;
  noun: string;
  lead: { name: string };
  fields: { key: string }[];
  documents: { code: string; name: string }[];
};

// What each tracked permit calls itself and needs, so pages do not branch on the type everywhere.
export function permitKind(typeCode: string | null | undefined, built?: BuiltInfo | null) {
  if (built?.builder) {
    return {
      license: false,
      built: true,
      typeName: built.name,
      leadName: built.lead.name,
      noun: built.noun,
      feeWhere: `${built.lead.name} tells the applicant where to pay. Where the fee is paid is not confirmed.`,
      pipeline: LICENSE_PIPELINE as readonly string[],
      pipelineLabel: PIPELINE_LABEL as Record<string, string>,
      documents: built.documents.map((document) => ({ code: document.code, name: document.name })),
      numberNote: `This is not an official ${built.lead.name} number.`,
      submitLabel: `Submit to ${built.lead.name} intake`,
      submitHint: built.documents.length
        ? "Submit needs every required answer, the attestation, and each paper on the list."
        : "Submit needs every required answer and the attestation.",
    };
  }
  const license = typeCode === LICENSE_TYPE.code;
  return {
    license,
    built: false,
    typeName: license ? LICENSE_TYPE.name : APPLICATION_TYPE.name,
    leadName: license ? "Revenue and Taxation" : "DPW",
    // The thing being issued, for sentences and buttons.
    noun: license ? "license" : "permit",
    // Where the fee is paid. The house route is on the DPW page. The license route is not confirmed.
    feeWhere: license
      ? "Revenue and Taxation contacts the applicant for pickup and fees once every clearance is endorsed. Where the fee is paid is not confirmed."
      : "Pay in person at the Treasurer of Guam cashier at the Business License and Permit Center.",
    pipeline: (license ? LICENSE_PIPELINE : PIPELINE) as readonly string[],
    pipelineLabel: PIPELINE_LABEL as Record<string, string>,
    documents: license
      ? LICENSE_DOCUMENTS.map((document) => ({ code: document.code as string, name: document.name as string }))
      : [{ code: "plans", name: "Plans" }, { code: "plot_plan", name: "Plot plan" }],
    numberNote: license
      ? "This is not an official Revenue and Taxation license number."
      : "This is not an official DPW number.",
    submitLabel: license ? "Submit to Revenue and Taxation intake" : "Submit to DPW intake",
    submitHint: license
      ? "Submit needs the business name, the activity, the full location, the attestation, a signed Form BL-01, and the Good Moral Character Questionnaire."
      : "Submit needs the lot fields, public sewer, a contractor license number, the attestation, a plans file, and a plot plan.",
  };
}

// The line a file is known by in lists and headings.
export function fileTitle(typeCode: string | null | undefined, row: { lot?: string | null; details?: unknown }, built?: BuiltInfo | null) {
  if (built?.builder) {
    const details = (row.details ?? {}) as Record<string, unknown>;
    for (const field of built.fields) {
      const value = details[field.key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
    return built.name;
  }
  if (typeCode === LICENSE_TYPE.code) {
    const details = (row.details ?? {}) as Record<string, unknown>;
    const name = typeof details.business_name === "string" ? details.business_name.trim() : "";
    return name || "Business license";
  }
  return `Lot ${row.lot || "not given"}`;
}

export function licenseDetails(details: unknown) {
  const source = (details ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof source[key] === "string" ? (source[key] as string) : "");
  return {
    businessName: text("business_name"),
    tradeName: text("trade_name"),
    entityType: text("entity_type"),
    registrationNumber: text("registration_number"),
    street: text("street"),
    village: text("village"),
  };
}
