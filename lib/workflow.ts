import { STEPS, type Phase, type Routing, type StepTemplate } from "./template";

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "intake",
  "plan_review",
  "clearances_in_progress",
  "awaiting_applicant",
  "fees_due",
  "issued",
  "inspections",
  "occupancy_issued",
  "denied",
  "withdrawn",
  "expired",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STEP_STATUSES = [
  "not_started",
  "queued",
  "in_progress",
  "info_requested",
  "approved",
  "rejected",
  "waived",
  "n_a",
] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];

export const TERMINAL_APPLICATION: ApplicationStatus[] = ["occupancy_issued", "denied", "withdrawn", "expired"];
export const TERMINAL_STEP: StepStatus[] = ["approved", "rejected", "waived", "n_a"];

const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ["submitted", "withdrawn"],
  submitted: ["intake", "denied", "withdrawn"],
  intake: ["plan_review", "awaiting_applicant", "denied", "withdrawn"],
  plan_review: ["clearances_in_progress", "awaiting_applicant", "denied", "withdrawn"],
  clearances_in_progress: ["fees_due", "awaiting_applicant", "denied", "withdrawn"],
  awaiting_applicant: ["intake", "plan_review", "clearances_in_progress", "fees_due", "inspections", "withdrawn"],
  fees_due: ["issued", "awaiting_applicant", "withdrawn", "expired"],
  issued: ["inspections", "expired"],
  inspections: ["occupancy_issued", "awaiting_applicant", "expired"],
  occupancy_issued: [],
  denied: [],
  withdrawn: [],
  expired: [],
};

const STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  not_started: ["queued", "n_a", "waived"],
  queued: ["in_progress", "info_requested", "n_a", "waived"],
  in_progress: ["info_requested", "approved", "rejected", "n_a", "waived"],
  info_requested: ["in_progress"],
  approved: [],
  rejected: [],
  waived: [],
  n_a: [],
};

const PHASE_STATUS: Record<Phase, ApplicationStatus> = {
  intake: "intake",
  plan_review: "plan_review",
  clearance: "clearances_in_progress",
  fees: "fees_due",
  issuance: "issued",
  inspection: "inspections",
  occupancy: "inspections",
};

export function canTransitionApplication(from: ApplicationStatus, to: ApplicationStatus) {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export function canTransitionStep(from: StepStatus, to: StepStatus) {
  return STEP_TRANSITIONS[from].includes(to);
}

export function blocksPhase(status: StepStatus, routing: Routing) {
  if (status === "approved" || status === "waived" || status === "n_a") return false;
  if (status === "not_started") return routing === "always" || routing === "default_routed";
  return true;
}

export type FlowStep = {
  code: string;
  phase: Phase;
  routing: Routing;
  status: StepStatus;
  agency: string;
};

export type FlowState = {
  status: ApplicationStatus;
  rfiReturn: ApplicationStatus | null;
  feesDueCents: number | null;
  feesPaid: boolean;
  permitNumber: string | null;
  steps: FlowStep[];
};

export type FlowResult = { ok: true; state: FlowState } | { ok: false; error: string };

export function initialState(templates: StepTemplate[] = STEPS): FlowState {
  return {
    status: "draft",
    rfiReturn: null,
    feesDueCents: null,
    feesPaid: false,
    permitNumber: null,
    steps: templates.map((step) => ({
      code: step.code,
      phase: step.phase,
      routing: step.routing,
      status: "not_started",
      agency: step.agency,
    })),
  };
}

export type DraftInput = {
  lot: string;
  tract: string;
  block: string;
  zoningDistrict: string;
  ownership: string;
  ownerName: string;
  scope: string;
  valuationCents: number | null;
  sewage: string;
  waterSupply: string;
  contractorLicense: string;
  architectSeal: string;
  engineerSeal: string;
  attestation: boolean;
  attestationName: string;
  hasPlans: boolean;
  hasPlotPlan: boolean;
};

export function validateDraft(input: DraftInput, mode: "save" | "submit") {
  if (mode === "save") {
    if (input.valuationCents != null && (!Number.isInteger(input.valuationCents) || input.valuationCents < 0)) {
      return "Declared valuation has to be a whole number of cents, or blank.";
    }
    if (input.sewage && input.sewage !== "public_sewer") {
      return "This application is only for a house on public sewer. Septic is a different route.";
    }
    return null;
  }
  const missing: string[] = [];
  if (!input.lot.trim()) missing.push("lot");
  if (!input.tract.trim()) missing.push("tract");
  if (!input.block.trim()) missing.push("block");
  if (!input.zoningDistrict.trim()) missing.push("zoning district");
  if (!["owner", "lessee", "authorized_agent"].includes(input.ownership)) missing.push("ownership");
  if (input.ownership === "authorized_agent" && !input.ownerName.trim()) missing.push("owner name");
  if (!input.scope.trim()) missing.push("scope");
  if (input.sewage !== "public_sewer") missing.push("public sewer");
  if (!input.waterSupply.trim()) missing.push("water supply");
  if (!input.contractorLicense.trim()) missing.push("contractor license number");
  if (!input.attestation || !input.attestationName.trim()) missing.push("signature attestation");
  if (!input.hasPlans) missing.push("plans");
  if (!input.hasPlotPlan) missing.push("plot plan");
  if (input.valuationCents != null && (!Number.isInteger(input.valuationCents) || input.valuationCents < 0)) {
    return "Declared valuation has to be a whole number of cents, or blank. It is not a fee.";
  }
  if (missing.length) return `Still needed before submit: ${missing.join(", ")}.`;
  return null;
}

function clone(state: FlowState): FlowState {
  return { ...state, steps: state.steps.map((step) => ({ ...step })) };
}

function fail(error: string): FlowResult {
  return { ok: false, error };
}

function stepOf(state: FlowState, code: string) {
  const step = state.steps.find((item) => item.code === code);
  if (!step) throw new Error(`unknown step ${code}`);
  return step;
}

function phaseClear(state: FlowState, phase: Phase) {
  return state.steps.filter((step) => step.phase === phase).every((step) => !blocksPhase(step.status, step.routing));
}

function queue(state: FlowState, phase: Phase, routings: Routing[]) {
  for (const step of state.steps) {
    if (step.phase === phase && step.status === "not_started" && routings.includes(step.routing)) {
      step.status = "queued";
    }
  }
}

function queueCode(state: FlowState, code: string) {
  const step = stepOf(state, code);
  if (step.status === "not_started") step.status = "queued";
}

function memoOk(memo: string | null | undefined) {
  return Boolean(memo && memo.trim().length >= 3);
}

export function maybeAdvance(state: FlowState): FlowState {
  const next = clone(state);
  if (next.steps.some((step) => step.status === "info_requested")) return next;
  if (next.status === "intake" && phaseClear(next, "intake")) {
    next.status = "plan_review";
    queue(next, "plan_review", ["always", "default_routed"]);
  }
  if (next.status === "plan_review" && phaseClear(next, "plan_review")) {
    next.status = "clearances_in_progress";
    queue(next, "clearance", ["always", "default_routed"]);
  }
  if (next.status === "clearances_in_progress" && phaseClear(next, "clearance")) {
    next.status = "fees_due";
    queueCode(next, "fee_assessment");
  }
  if (next.status === "inspections" && phaseClear(next, "inspection")) {
    queueCode(next, "certificate_of_occupancy");
  }
  const occupancy = next.steps.find((step) => step.code === "certificate_of_occupancy");
  if (next.status === "inspections" && occupancy?.status === "approved") {
    next.status = "occupancy_issued";
  }
  return next;
}

export function submitApplication(state: FlowState): FlowResult {
  if (state.status !== "draft") return fail("illegal_application_transition");
  if (!canTransitionApplication(state.status, "submitted")) return fail("illegal_application_transition");
  const next = clone(state);
  next.status = "submitted";
  queue(next, "intake", ["always", "default_routed"]);
  return { ok: true, state: next };
}

export function routeStep(state: FlowState, code: string, to: "queued" | "n_a" | "waived", memo?: string): FlowResult {
  const next = clone(state);
  const step = stepOf(next, code);
  if (!canTransitionStep(step.status, to)) return fail("illegal_step_transition");
  if ((to === "n_a" || to === "waived") && !memoOk(memo)) return fail("memo_required");
  step.status = to;
  return { ok: true, state: maybeAdvance(next) };
}

export function reviewStep(
  state: FlowState,
  code: string,
  to: "in_progress" | "approved" | "rejected" | "n_a" | "waived",
  memo?: string,
): FlowResult {
  const next = clone(state);
  const step = stepOf(next, code);
  if (!canTransitionStep(step.status, to)) return fail("illegal_step_transition");
  if ((to === "rejected" || to === "n_a" || to === "waived") && !memoOk(memo)) return fail("memo_required");
  step.status = to;
  if (to === "in_progress") {
    const target = PHASE_STATUS[step.phase];
    if (next.status !== target && canTransitionApplication(next.status, target)) next.status = target;
  }
  if (to === "rejected") return { ok: true, state: next };
  return { ok: true, state: maybeAdvance(next) };
}

export function requestInfo(state: FlowState, code: string, body: string): FlowResult {
  if (!body.trim()) return fail("memo_required");
  const next = clone(state);
  const step = stepOf(next, code);
  if (!canTransitionStep(step.status, "info_requested")) return fail("illegal_step_transition");
  if (!canTransitionApplication(next.status, "awaiting_applicant")) return fail("illegal_application_transition");
  step.status = "info_requested";
  if (next.status !== "awaiting_applicant") next.rfiReturn = next.status;
  next.status = "awaiting_applicant";
  return { ok: true, state: next };
}

export function respondInfo(state: FlowState, code: string, response: string): FlowResult {
  if (!response.trim()) return fail("memo_required");
  const next = clone(state);
  const step = stepOf(next, code);
  if (step.status !== "info_requested") return fail("illegal_step_transition");
  step.status = "in_progress";
  const stillOpen = next.steps.some((item) => item.status === "info_requested");
  if (!stillOpen) {
    const back = next.rfiReturn;
    if (!back || !canTransitionApplication(next.status, back)) return fail("illegal_application_transition");
    next.status = back;
    next.rfiReturn = null;
  }
  return { ok: true, state: next };
}

export function assessFees(state: FlowState, cents: number, memo: string): FlowResult {
  if (!Number.isInteger(cents) || cents < 0) return fail("fee_amount_required");
  if (!memoOk(memo)) return fail("memo_required");
  if (state.status !== "fees_due") return fail("illegal_application_transition");
  const next = clone(state);
  next.feesDueCents = cents;
  const fee = stepOf(next, "fee_assessment");
  if (fee.status === "not_started") fee.status = "queued";
  if (!canTransitionStep(fee.status, "approved") && fee.status !== "approved") {
    if (canTransitionStep(fee.status, "in_progress")) fee.status = "in_progress";
  }
  if (fee.status !== "approved") {
    if (!canTransitionStep(fee.status, "approved")) return fail("illegal_step_transition");
    fee.status = "approved";
  }
  queueCode(next, "tog_payment");
  return { ok: true, state: next };
}

export function markFeesPaid(state: FlowState, memo: string): FlowResult {
  if (!memoOk(memo)) return fail("memo_required");
  if (state.feesDueCents == null) return fail("fee_amount_required");
  const next = clone(state);
  const payment = stepOf(next, "tog_payment");
  if (payment.status === "not_started") return fail("illegal_step_transition");
  if (payment.status !== "approved") {
    if (canTransitionStep(payment.status, "in_progress") && payment.status !== "in_progress") payment.status = "in_progress";
    if (!canTransitionStep(payment.status, "approved")) return fail("illegal_step_transition");
    payment.status = "approved";
  }
  next.feesPaid = true;
  return { ok: true, state: next };
}

export function issuePermit(state: FlowState, memo: string, permitNumber: string): FlowResult {
  if (!memoOk(memo)) return fail("memo_required");
  if (state.feesDueCents == null || !state.feesPaid) return fail("fees_not_paid");
  if (!phaseClear(state, "fees")) return fail("fees_not_complete");
  if (!canTransitionApplication(state.status, "issued")) return fail("illegal_application_transition");
  const next = clone(state);
  next.status = "issued";
  next.permitNumber = permitNumber;
  const issue = stepOf(next, "dpw_issue_permit");
  if (issue.status === "not_started") issue.status = "queued";
  if (issue.status === "queued") issue.status = "in_progress";
  if (issue.status !== "approved") {
    if (!canTransitionStep(issue.status, "approved")) return fail("illegal_step_transition");
    issue.status = "approved";
  }
  if (!canTransitionApplication(next.status, "inspections")) return fail("illegal_application_transition");
  next.status = "inspections";
  queue(next, "inspection", ["provisional", "always", "default_routed"]);
  return { ok: true, state: next };
}

export function withdrawApplication(state: FlowState): FlowResult {
  if (!canTransitionApplication(state.status, "withdrawn")) return fail("illegal_application_transition");
  const next = clone(state);
  next.status = "withdrawn";
  return { ok: true, state: next };
}

export function denyApplication(state: FlowState, memo: string): FlowResult {
  if (!memoOk(memo)) return fail("memo_required");
  if (!canTransitionApplication(state.status, "denied")) return fail("illegal_application_transition");
  const next = clone(state);
  next.status = "denied";
  return { ok: true, state: next };
}

export function expireApplication(state: FlowState, memo: string): FlowResult {
  if (!memoOk(memo)) return fail("memo_required");
  if (!canTransitionApplication(state.status, "expired")) return fail("illegal_application_transition");
  const next = clone(state);
  next.status = "expired";
  return { ok: true, state: next };
}

export function reopenStep(state: FlowState, code: string, memo: string): FlowResult {
  if (!memoOk(memo)) return fail("memo_required");
  const next = clone(state);
  const step = stepOf(next, code);
  if (!TERMINAL_STEP.includes(step.status)) return fail("illegal_step_transition");
  step.status = "in_progress";
  const target = PHASE_STATUS[step.phase];
  if (TERMINAL_APPLICATION.includes(next.status) || next.status !== target) next.status = target;
  return { ok: true, state: next };
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
