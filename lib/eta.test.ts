import assert from "node:assert/strict";
import test from "node:test";
import { estimateEta, formatDuration, stepEstimateLabel, type EtaStep, type StepEstimate } from "./eta";

const DAY = 86400;
const now = new Date("2026-11-13T00:00:00Z");
const step = (code: string, phase: string, status: string, routing = "always", startedAt: string | null = null): EtaStep => ({ code, phase, status, routing, startedAt });
const est = (code: string, days: number, samples = 5): StepEstimate => ({ code, samples, medianSeconds: days * DAY });

const file = [
  step("intake", "intake", "approved"),
  step("arch", "plan_review", "in_progress", "default_routed", "2026-11-12T00:00:00Z"),
  step("structural", "plan_review", "queued", "default_routed", "2026-11-12T00:00:00Z"),
  step("mech", "plan_review", "not_started", "as_indicated"),
  step("zoning", "clearance", "not_started", "always"),
  step("historic", "clearance", "not_started", "gated"),
  step("fee", "fees", "not_started"),
  step("issue", "issuance", "not_started"),
  step("final", "inspection", "not_started", "provisional"),
];

test("no estimate until every step that will hold the file has history", () => {
  const eta = estimateEta("plan_review", file, [est("arch", 4), est("structural", 6)], now);
  assert.deepEqual(eta, { kind: "none", known: 2, needed: 5 });
});

test("parallel phases take their slowest step, phases add up, time spent is subtracted", () => {
  const eta = estimateEta("plan_review", file, [est("arch", 4), est("structural", 6, 3), est("zoning", 2), est("fee", 1), est("issue", 1)], now);
  assert.equal(eta.kind, "estimate");
  if (eta.kind !== "estimate") return;
  // plan review: max(4-1, 6-1) = 5, clearance 2, fees 1, issuance 1.
  assert.equal(eta.remainingSeconds, 9 * DAY);
  assert.equal(eta.readyBy.toISOString(), "2026-11-22T00:00:00.000Z");
  assert.equal(eta.samples, 3);
});

test("unrouted and inspection steps are ignored, a routed one is counted", () => {
  const all = [est("arch", 4), est("structural", 6), est("zoning", 2), est("fee", 1), est("issue", 1)];
  const routed = file.map((item) => (item.code === "mech" ? { ...item, status: "queued", startedAt: now.toISOString() } : item));
  assert.equal(estimateEta("plan_review", routed, all, now).kind, "none");
  const withMech = estimateEta("plan_review", routed, [...all, est("mech", 10)], now);
  assert.equal(withMech.kind === "estimate" && withMech.remainingSeconds, 14 * DAY);
});

test("a step past its usual time counts as due now, never negative", () => {
  const late = [step("issue", "issuance", "in_progress", "always", "2026-10-01T00:00:00Z")];
  const eta = estimateEta("fees_due", late, [est("issue", 1)], now);
  assert.equal(eta.kind === "estimate" && eta.remainingSeconds, 0);
});

test("finished, closed, and waiting-on-applicant files show no countdown", () => {
  assert.deepEqual(estimateEta("issued", file, [], now), { kind: "done" });
  assert.deepEqual(estimateEta("denied", file, [], now), { kind: "paused", reason: "closed" });
  assert.deepEqual(estimateEta("awaiting_applicant", file, [], now), { kind: "paused", reason: "applicant" });
});

test("durations and labels read plainly", () => {
  assert.equal(formatDuration(1800), "under an hour");
  assert.equal(formatDuration(5 * 3600), "about 5 hours");
  assert.equal(formatDuration(30 * 3600), "about 1 day");
  assert.equal(formatDuration(6 * DAY), "about 6 days");
  assert.equal(formatDuration(21 * DAY), "about 3 weeks");
  assert.match(stepEstimateLabel(undefined), /No estimate yet/);
  assert.equal(stepEstimateLabel(est("arch", 4, 7)), "Usually about 4 days, from 7 finished files on this tracker.");
});
