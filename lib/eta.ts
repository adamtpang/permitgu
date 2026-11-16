// Tracker ETA. Estimates come only from this tracker's own finished steps
// (see supabase/migrations/20261113230000_step_eta.sql). No agency has published
// timelines for these steps, so a step with too little history has no estimate.

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
    text: "Published: a Land Management agenda shows the Application Review Committee setting a 30-day timeline once an application is on its agenda. That is one agenda, not a rule.",
    source: "https://dlm.guam.gov/wp-dlm-content/uploads/2026/08/AUG202026-Final.pdf",
    label: "Committee agenda, August 20, 2026",
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
