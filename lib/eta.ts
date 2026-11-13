// Tracker ETA. Estimates come only from this tracker's own finished steps
// (see supabase/migrations/20261113230000_step_eta.sql). No agency has published
// timelines for these steps, so a step with too little history has no estimate.

export type StepEstimate = { code: string; samples: number; medianSeconds: number };

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
