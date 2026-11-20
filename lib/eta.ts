// Tracker ETA. Estimates come only from this tracker's own finished steps
// (see supabase/migrations/20261113230000_step_eta.sql). No agency has published
// timelines for most steps, so a step with too little history has no estimate.

// sampleFiles is how many of the finished files behind an estimate are made-up sample files.
export type StepEstimate = { code: string; samples: number; medianSeconds: number; sampleFiles?: number };

export type EtaStep = {
  code: string;
  phase: string;
  routing: string;
  status: string;
  startedAt: string | null;
};

// Review disciplines and clearances run side by side, so a phase takes as long
// as its slowest step. Phases themselves run one after another.
const PARALLEL = new Set(["plan_review", "clearance"]);
// The estimate stops at permit issuance. Inspections follow the build, which
// the owner controls, so they are not an agency wait.
export const ETA_PHASES = ["intake", "plan_review", "clearance", "fees", "issuance"] as const;
const ACTIVE = new Set(["queued", "in_progress", "info_requested"]);
const DEFAULT_ROUTED = new Set(["always", "default_routed"]);
const DAY = 86400;

export type Eta =
  | { kind: "done" }
  | { kind: "paused"; reason: "applicant" | "closed" }
  | { kind: "none"; known: number; needed: number }
  | { kind: "estimate"; remainingSeconds: number; readyBy: Date; samples: number };

export function formatDuration(seconds: number) {
  if (seconds < 3600) return "under an hour";
  if (seconds < 2 * DAY) {
    const hours = Math.round(seconds / 3600);
    return hours >= 24 ? "about 1 day" : `about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(seconds / DAY);
  if (days < 14) return `about ${days} days`;
  const weeks = Math.round(days / 7);
  return `about ${weeks} weeks`;
}

export function stepEstimateLabel(estimate: StepEstimate | undefined) {
  if (!estimate) return "No estimate yet. Too few finished files on this tracker.";
  if (estimate.sampleFiles) {
    return `Sample data: ${formatDuration(estimate.medianSeconds)}, from ${estimate.samples} finished files, ${estimate.sampleFiles === estimate.samples ? "all" : estimate.sampleFiles} of them made-up samples. Not a real agency time.`;
  }
  return `Usually ${formatDuration(estimate.medianSeconds)}, from ${estimate.samples} finished files on this tracker.`;
}

// Time still expected on one open step: its median minus the time already spent,
// never below zero. A step that has run past its median counts as due now.
function remainingFor(step: EtaStep, median: number, now: Date) {
  if (!ACTIVE.has(step.status) || !step.startedAt) return median;
  const spent = (now.getTime() - new Date(step.startedAt).getTime()) / 1000;
  return Math.max(0, median - Math.max(0, spent));
}

export function estimateEta(
  applicationStatus: string,
  steps: EtaStep[],
  estimates: StepEstimate[],
  now: Date = new Date(),
): Eta {
  if (["issued", "inspections", "occupancy_issued"].includes(applicationStatus)) return { kind: "done" };
  if (["denied", "withdrawn", "expired", "draft"].includes(applicationStatus)) return { kind: "paused", reason: "closed" };
  if (applicationStatus === "awaiting_applicant") return { kind: "paused", reason: "applicant" };

  const byCode = new Map(estimates.map((estimate) => [estimate.code, estimate]));
  // Open steps that will hold the file: anything an agency holds now, plus steps
  // that have not started but are routed by default. An "as indicated" clearance
  // counts only once a reviewer has routed it.
  const open = steps.filter((step) => {
    if (!(ETA_PHASES as readonly string[]).includes(step.phase)) return false;
    if (ACTIVE.has(step.status)) return true;
    return step.status === "not_started" && DEFAULT_ROUTED.has(step.routing);
  });
  if (!open.length) return { kind: "none", known: 0, needed: 0 };

  const known = open.filter((step) => byCode.has(step.code));
  if (known.length < open.length) return { kind: "none", known: known.length, needed: open.length };

  let remainingSeconds = 0;
  let samples = Infinity;
  for (const phase of ETA_PHASES) {
    const inPhase = open.filter((step) => step.phase === phase);
    if (!inPhase.length) continue;
    const waits = inPhase.map((step) => {
      const estimate = byCode.get(step.code)!;
      samples = Math.min(samples, estimate.samples);
      return remainingFor(step, estimate.medianSeconds, now);
    });
    remainingSeconds += PARALLEL.has(phase) ? Math.max(...waits) : waits.reduce((sum, wait) => sum + wait, 0);
  }
  return {
    kind: "estimate",
    remainingSeconds,
    readyBy: new Date(now.getTime() + remainingSeconds * 1000),
    samples,
  };
}

// Figures an agency or the Public Auditor has published for a step. They are shown
// beside the step as published, and never mixed into the tracker's own estimate.
// A key is "permit code:step code". A bare step code is the house permit, which came first.
const PUBLISHED: Record<string, { text: string; source: string; label: string }> = {
  historic_preservation: {
    text: "Published: the Historic Preservation Office's goal for a certificate of approval is 30 days. The Public Auditor measured an average of 37 days, with a range of 0 to 205, for fiscal years 2018 to 2023.",
    source: "https://www.opaguam.org/sites/default/files/opa-report-25-05-es.pdf",
    label: "Public Auditor report 25-05",
  },
  "x_zone_variance:s_arc_review": {
    text: "Set by law: the review committee should send its reports within 30 days of filing, where possible. That is a target, not a hard limit. One 2026 committee agenda also set a 30-day timeline.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61106(b)",
  },
  "x_zone_change:s_arc_review": {
    text: "Set by law: the review committee should send its reports within 30 days of filing, where possible. That is a target, not a hard limit.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61106(b)",
  },
  "x_zone_change:s_mailed_and_newspaper_notice": {
    text: "Set by law: the hearing notice runs in a newspaper at least 10 days before the hearing, and is mailed to the mayor and to owners within 500 feet.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61633(a)",
  },
  "x_zone_variance:s_village_council": {
    text: "Set by law: the village planning council sends its resolution to the Commission within 20 days of its public hearing.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61623(a)",
  },
  "x_sanitary_permit_food:intake": {
    text: "Published: submit the application and papers at least 30 days before you plan to open.",
    source: "https://web.archive.org/web/20250903054533id_/https://dphss.guam.gov/wp-content/uploads/2023/05/Sanitary-Permit.FORM_.A_2023.pdf",
    label: "Public Health Form A, 2023",
  },
  "x_sanitary_permit_food:issue": {
    text: "Published: once every requirement is met, including the inspection, you can ask for processing within 24 hours for an extra $100. From rules dated November 2021. We did not confirm they were formally adopted.",
    source: "https://web.archive.org/web/20250903054457id_/https://dphss.guam.gov/wp-content/uploads/2022/04/SPRR_11.09.21.pdf",
    label: "Public Health sanitary permit rules, 2021",
  },
  "x_temporary_food_event:intake": {
    text: "Published: an application filed one day or less before the event pays a $50 expedited fee. From rules dated November 2021. We did not confirm they were formally adopted.",
    source: "https://web.archive.org/web/20250903054457id_/https://dphss.guam.gov/wp-content/uploads/2022/04/SPRR_11.09.21.pdf",
    label: "Public Health sanitary permit rules, 2021",
  },
  "x_temporary_alcohol_license:intake": {
    text: "Published: the application says to submit it within 30 days before the event. That may mean no later than 30 days before, so apply early.",
    source: "https://www.govguamdocs.com/revtax/docs/AlcoholicBeverageLicenseApplication(2023.11).pdf",
    label: "Alcoholic Beverage License application, 2023",
  },
  "x_park_reservation:intake": {
    text: "Published: reservations open 3 months before the date.",
    source: "https://dpr.guam.gov/3687-2/",
    label: "Parks and Recreation reservations",
  },
  "x_road_work:s_gwa_clearance": {
    text: "Published: Waterworks needs the start date at least 3 full working days before work starts. Its clearance is valid for 10 days.",
    source: "https://guamwaterworks.org/wp-content/uploads/2021/05/ENGP-009-5-17-21-Updated-Utility-Clearance-Request-Form-Fillable.pdf",
    label: "Waterworks form ENGP-009",
  },
  "x_power_service:intake": {
    text: "Published: for a new building, apply 8 months before you need power (12 months for a pad-mounted transformer), so the Power Authority can order materials.",
    source: "https://www.guampowerauthority.com/residential/residential-forms-and-permits",
    label: "Power Authority forms and permits",
  },
  "x_power_service:issue": {
    text: "Published: same-day connection is available for a $9 fee. It appears to cover a place that already has a meter, not a new building.",
    source: "https://www.guampowerauthority.com/how-do-i/start-stop-move-services",
    label: "Power Authority start, stop, and move",
  },
  "x_conditional_use:intake": {
    text: "Published: Land Management's process chart shows a preliminary application interview of about ten working days.",
    source: "https://dlm.guam.gov/wp-dlm-content/uploads/2024/01/GLUC-Form-01_ConditionalUse-2020.pdf",
    label: "Conditional use form, process chart",
  },
  "x_conditional_use:s_arc_review": {
    text: "Set by law: the review committee should send its reports within 30 days of filing, where possible. That is a target, not a hard limit. Land Management's process chart shows a 60 calendar day review period.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61106(b)",
  },
  "x_conditional_use:s_notice_sign": {
    text: "Set by law: the sign stays up with current information for at least 10 days in a row before each hearing or meeting.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61303(c)(1)",
  },
  "x_conditional_use:s_mailed_notice": {
    text: "Set by law: written notice reaches owners within 500 feet at least 10 days before the hearing in person, or at least 25 days before by certified mail.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61303(c)(1)",
  },
  "x_seashore_clearance:s_public_hearing": {
    text: "Set by law: the hearing is set no less than 21 and no more than 90 days after filing.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc063.pdf",
    label: "21 GCA §63108(b)(2), 2007 copy",
  },
  "x_seashore_clearance:s_commission_decision": {
    text: "Set by law: the Commission acts within 60 days after the hearing ends.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc063.pdf",
    label: "21 GCA §63108(b)(3), 2007 copy",
  },
  "x_business_license_renewal:intake": {
    text: "Set by law: renew by one year after the license was issued. After that, $1 a day is added, and after 30 days the business must stop until it renews.",
    source: "https://col.guamcourts.gov/sites/default/files/11gc070.pdf",
    label: "11 GCA §70117(b)",
  },
  gpa_clearance: {
    text: "Published: for a new building, apply for power 8 months before you need it (12 months for a pad-mounted transformer), so the Power Authority can order materials.",
    source: "https://www.guampowerauthority.com/residential/residential-forms-and-permits",
    label: "Power Authority forms and permits",
  },
  "x_contractor_license:s_examination": {
    text: "Published: the Board gives the examination on the 2nd and 4th Tuesday of the month.",
    source: "http://clb.guam.gov/wp-content/uploads/2024/04/Application-Information-Packet-2024-04-25.pdf",
    label: "Board application packet, April 2024",
  },
  "x_contractor_license:s_board_decision": {
    text: "Published: the Board issues the license or says why not within 45 working days after the application is filed. The law itself says 45 days.",
    source: "http://clb.guam.gov/wp-content/uploads/2024/04/Application-Information-Packet-2024-04-25.pdf",
    label: "Board application packet, April 2024",
  },
  "x_zone_change:s_commission_decision": {
    text: "Set by law: the Commission decides a zone change within 40 days of the hearing.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61634",
  },
  "x_zone_change:s_notice_sign": {
    text: "Set by law: the notice sign goes up on the lot within 5 days of filing.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61633",
  },
  "x_water_service:issue": {
    text: "Published: once the Job Cost Sheet is paid, Waterworks says the meter is typically installed in 3 to 5 working days.",
    source: "https://guamwaterworks.org/faq/water-sewer-service-application/",
    label: "Waterworks service steps",
  },
  "x_zone_variance:s_notice_sign": {
    text: "Set by law: the notice sign goes up on the lot within 5 days of filing.",
    source: "https://col.guamcourts.gov/sites/default/files/21gc061_Q.pdf",
    label: "21 GCA §61619",
  },
};

const HOUSE_TYPE = "building_permit_residential_one_family";

export function publishedTime(stepCode: string, typeCode?: string | null) {
  if (typeCode && typeCode !== HOUSE_TYPE) return PUBLISHED[`${typeCode}:${stepCode}`] ?? null;
  return PUBLISHED[stepCode] ?? null;
}
