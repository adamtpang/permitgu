import assert from "node:assert/strict";
import test from "node:test";
import {
  assessFees,
  blocksPhase,
  canTransitionApplication,
  canTransitionStep,
  denyApplication,
  expireApplication,
  initialState,
  issuePermit,
  markFeesPaid,
  reopenStep,
  requestInfo,
  respondInfo,
  reviewStep,
  routeStep,
  submitApplication,
  validateDraft,
  withdrawApplication,
  type FlowState,
} from "./workflow";

const ready = {
  lot: "12",
  tract: "4",
  block: "2",
  zoningDistrict: "R1 example",
  ownership: "owner",
  ownerName: "",
  scope: "New private one-family dwelling",
  valuationCents: 25000000,
  sewage: "public_sewer",
  waterSupply: "public",
  contractorLicense: "CLB-DEMO-100",
  architectSeal: "",
  engineerSeal: "PE-DEMO-200",
  attestation: true,
  attestationName: "Maria Cruz",
  hasPlans: true,
  hasPlotPlan: true,
};

function ok(result: { ok: true; state: FlowState } | { ok: false; error: string }) {
  if (!result.ok) assert.fail(result.error);
  return result.state;
}

function status(state: FlowState, code: string) {
  return state.steps.find((step) => step.code === code)?.status;
}

test("application and step transitions match the tracker", () => {
  assert.equal(canTransitionApplication("draft", "submitted"), true);
  assert.equal(canTransitionApplication("draft", "issued"), false);
  assert.equal(canTransitionApplication("fees_due", "issued"), true);
  assert.equal(canTransitionApplication("occupancy_issued", "inspections"), false);
  assert.equal(canTransitionStep("not_started", "approved"), false);
  assert.equal(canTransitionStep("queued", "in_progress"), true);
  assert.equal(canTransitionStep("in_progress", "approved"), true);
  assert.equal(canTransitionStep("approved", "in_progress"), false);
});

test("not-started steps block only when the template always routes them", () => {
  assert.equal(blocksPhase("not_started", "always"), true);
  assert.equal(blocksPhase("not_started", "default_routed"), true);
  assert.equal(blocksPhase("not_started", "as_indicated"), false);
  assert.equal(blocksPhase("not_started", "gated"), false);
  assert.equal(blocksPhase("not_started", "provisional"), false);
  assert.equal(blocksPhase("queued", "as_indicated"), true);
  assert.equal(blocksPhase("n_a", "always"), false);
  assert.equal(blocksPhase("rejected", "as_indicated"), true);
});

test("submit validation does not invent a fee", () => {
  assert.equal(validateDraft(ready, "submit"), null);
  assert.match(validateDraft({ ...ready, sewage: "septic" }, "submit") ?? "", /public sewer/);
  assert.match(validateDraft({ ...ready, hasPlotPlan: false }, "submit") ?? "", /plot plan/);
  assert.match(validateDraft({ ...ready, valuationCents: 12.5 }, "save") ?? "", /cents/);
  assert.equal(validateDraft({ ...ready, attestation: false }, "save"), null);
});

test("happy path queues only the default sewered one-family steps", () => {
  let state = initialState();
  state = ok(submitApplication(state));
  assert.equal(state.status, "submitted");
  assert.equal(status(state, "dpw_intake"), "queued");
  assert.equal(status(state, "dpw_architectural"), "not_started");
  assert.equal(status(state, "gwa_availability"), "not_started");

  state = ok(reviewStep(state, "dpw_intake", "in_progress"));
  assert.equal(state.status, "intake");
  state = ok(reviewStep(state, "dpw_intake", "approved", "File is complete enough for plan review."));
  assert.equal(state.status, "plan_review");
  assert.equal(status(state, "dpw_architectural"), "queued");
  assert.equal(status(state, "dpw_structural"), "queued");
  assert.equal(status(state, "dpw_flood_control"), "not_started");

  state = ok(reviewStep(state, "dpw_architectural", "in_progress"));
  state = ok(reviewStep(state, "dpw_architectural", "approved", "Architectural set accepted for this demo."));
  assert.equal(state.status, "plan_review");
  state = ok(reviewStep(state, "dpw_structural", "in_progress"));
  state = ok(reviewStep(state, "dpw_structural", "approved", "Structural set accepted for this demo."));
  assert.equal(state.status, "clearances_in_progress");
  assert.equal(status(state, "dlm_zoning"), "queued");
  assert.equal(status(state, "gwa_availability"), "queued");
  assert.equal(status(state, "gepa_review"), "not_started");
  assert.equal(status(state, "historic_preservation"), "not_started");
  assert.equal(status(state, "gfd_fire"), "not_started");

  state = ok(reviewStep(state, "dlm_zoning", "in_progress"));
  state = ok(reviewStep(state, "dlm_zoning", "approved", "Zoning examination recorded."));
  state = ok(reviewStep(state, "gwa_availability", "in_progress"));
  state = ok(reviewStep(state, "gwa_availability", "approved", "Public sewer and water availability recorded."));
  assert.equal(state.status, "fees_due");
  assert.equal(state.feesDueCents, null);
  assert.equal(status(state, "fee_assessment"), "queued");
  assert.equal(status(state, "tog_payment"), "not_started");
  assert.equal(status(state, "insp_foundation"), "not_started");

  assert.equal(issuePermit(state, "Cannot issue yet.", "DEMO-2026-0001").ok, false);
  state = ok(assessFees(state, 0, "Staff entered zero after checking the paper table. Not a published fee."));
  assert.equal(state.feesDueCents, 0);
  assert.equal(markFeesPaid({ ...state, feesDueCents: null }, "Paid.").ok, false);
  state = ok(markFeesPaid(state, "Paid in person at the Treasurer of Guam cashier."));
  assert.equal(state.feesPaid, true);
  assert.equal(state.status, "fees_due");

  state = ok(issuePermit(state, "Demo permit issued after in-person payment.", "DEMO-2026-0001"));
  assert.equal(state.status, "inspections");
  assert.equal(state.permitNumber, "DEMO-2026-0001");
  assert.equal(status(state, "insp_foundation"), "queued");
  assert.equal(status(state, "insp_framing"), "queued");
  assert.equal(status(state, "insp_final"), "queued");
  assert.equal(status(state, "certificate_of_occupancy"), "not_started");

  for (const code of ["insp_foundation", "insp_framing", "insp_final"]) {
    state = ok(reviewStep(state, code, "in_progress"));
    state = ok(reviewStep(state, code, "approved", `${code} recorded. Provisional checklist.`));
  }
  assert.equal(state.status, "inspections");
  assert.equal(status(state, "certificate_of_occupancy"), "queued");
  state = ok(reviewStep(state, "certificate_of_occupancy", "in_progress"));
  state = ok(reviewStep(state, "certificate_of_occupancy", "approved", "Occupancy recorded in this demo."));
  assert.equal(state.status, "occupancy_issued");
});

test("conditional and historic steps do not block until routed", () => {
  let state = initialState();
  state = ok(submitApplication(state));
  state = ok(reviewStep(state, "dpw_intake", "in_progress"));
  state = ok(reviewStep(state, "dpw_intake", "approved", "Intake done."));
  state = ok(reviewStep(state, "dpw_architectural", "in_progress"));
  state = ok(reviewStep(state, "dpw_architectural", "approved", "Arch done."));
  state = ok(reviewStep(state, "dpw_structural", "in_progress"));
  state = ok(reviewStep(state, "dpw_structural", "approved", "Structural done."));
  state = ok(routeStep(state, "historic_preservation", "queued"));
  state = ok(reviewStep(state, "dlm_zoning", "in_progress"));
  state = ok(reviewStep(state, "dlm_zoning", "approved", "Zone done."));
  state = ok(reviewStep(state, "gwa_availability", "in_progress"));
  state = ok(reviewStep(state, "gwa_availability", "approved", "GWA done."));
  assert.equal(state.status, "clearances_in_progress");
  assert.equal(status(state, "historic_preservation"), "queued");
  state = ok(routeStep(state, "historic_preservation", "n_a", "Staff marked historic review not applicable."));
  assert.equal(state.status, "fees_due");
});

test("a rejection does not advance the file", () => {
  let state = initialState();
  state = ok(submitApplication(state));
  state = ok(reviewStep(state, "dpw_intake", "in_progress"));
  state = ok(reviewStep(state, "dpw_intake", "rejected", "Plans were not in the upload."));
  assert.equal(state.status, "intake");
  assert.equal(denyApplication(state, "no").ok, false);
  state = ok(denyApplication(state, "Denied because intake rejected the file."));
  assert.equal(state.status, "denied");
  assert.equal(withdrawApplication(state).ok, false);
});

test("an information request returns to the same phase", () => {
  let state = initialState();
  state = ok(submitApplication(state));
  state = ok(reviewStep(state, "dpw_intake", "in_progress"));
  state = ok(requestInfo(state, "dpw_intake", "Need a clearer plot plan."));
  assert.equal(state.status, "awaiting_applicant");
  assert.equal(state.rfiReturn, "intake");
  state = ok(respondInfo(state, "dpw_intake", "Uploaded a replacement plot plan."));
  assert.equal(state.status, "intake");
  assert.equal(status(state, "dpw_intake"), "in_progress");
});

test("illegal transitions and missing memos fail", () => {
  const state = ok(submitApplication(initialState()));
  assert.equal(reviewStep(state, "dpw_intake", "approved", "Skip the queue.").ok, false);
  assert.equal(reviewStep(state, "dpw_intake", "n_a", "no").ok, false);
  assert.equal(routeStep(state, "dpw_flood_control", "queued").ok, true);
  assert.equal(expireApplication(state, "Too soon.").ok, false);
  assert.equal(withdrawApplication(state).ok, true);
});

test("break-glass reopen requires a memo and leaves the terminal step", () => {
  let state = initialState();
  state = ok(submitApplication(state));
  state = ok(reviewStep(state, "dpw_intake", "in_progress"));
  state = ok(reviewStep(state, "dpw_intake", "rejected", "Missing sheet."));
  state = ok(denyApplication(state, "Denied at intake."));
  assert.equal(reopenStep(state, "dpw_intake", "no").ok, false);
  state = ok(reopenStep(state, "dpw_intake", "Super admin reopened intake after a corrected upload."));
  assert.equal(status(state, "dpw_intake"), "in_progress");
  assert.equal(state.status, "intake");
});
