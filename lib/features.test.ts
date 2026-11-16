import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { staffAccessDecision } from "./access";
import { filterAudit } from "./audit-view";
import { backlog, filterQueue, waitingDays, waitingLabel, type QueueItem } from "./queue";
import { agencyRollup, currentStep, type TrackerStep, fileHeadline, splitTimeline, timelineLabel } from "./tracker-model";
import { noticeText, staffNotice, withNotice } from "./notices";

const steps: TrackerStep[] = [
  { id: "1", name: "DPW intake", agency: "DPW", agencyName: "Public Works", status: "approved", routing: "always", sort: 10, uncertainty: null, memo: null },
  { id: "2", name: "Zoning", agency: "DLM", agencyName: "Land Management", status: "queued", routing: "always", sort: 20, uncertainty: null, memo: null },
  { id: "3", name: "Water", agency: "GWA", agencyName: "Waterworks", status: "not_started", routing: "default_routed", sort: 30, uncertainty: "Confirm with GWA.", memo: null },
];

test("the tracker names the current step and rolls up each agency", () => {
  assert.equal(currentStep(steps)?.name, "Zoning");
  const rollup = agencyRollup(steps);
  assert.deepEqual(
    rollup.map((group) => [group.agency, group.status]),
    [
      ["DPW", "approved"],
      ["DLM", "in_progress"],
      ["GWA", "not_started"],
    ],
  );
});

test("staff routes require a signed-in aal2 session", () => {
  assert.equal(staffAccessDecision({ pathname: "/apply", configured: true, signedIn: false, aal: null }), "allow");
  assert.equal(staffAccessDecision({ pathname: "/review", configured: false, signedIn: false, aal: null }), "allow");
  assert.equal(staffAccessDecision({ pathname: "/review", configured: true, signedIn: false, aal: null }), "redirect-signin");
  assert.equal(staffAccessDecision({ pathname: "/review/abc", configured: true, signedIn: true, aal: "aal1" }), "redirect-mfa");
  assert.equal(staffAccessDecision({ pathname: "/admin/audit", configured: true, signedIn: true, aal: "aal2" }), "allow");
  assert.equal(staffAccessDecision({ pathname: "/staff/sign-in", configured: true, signedIn: true, aal: "aal1" }), "allow");
});

const queue: QueueItem[] = [
  {
    id: "s1",
    applicationId: "a1",
    status: "queued",
    agencyCode: "gwa",
    permitType: "building_permit_residential_one_family",
    assigneeId: null,
    assigneeName: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    lot: "12",
    applicant: "Maria Cruz",
    permitNumber: null,
    stepName: "GWA availability",
  },
  {
    id: "s2",
    applicationId: "a2",
    status: "in_progress",
    agencyCode: "dpw",
    permitType: "building_permit_residential_one_family",
    assigneeId: "staff-1",
    assigneeName: "Daniel Reyes",
    updatedAt: "2026-11-09T00:00:00.000Z",
    lot: "99",
    applicant: "Juan Dela Cruz",
    permitNumber: "DEMO-2026-0002",
    stepName: "Intake",
  },
];

test("the staff queue filters by status, agency, assignee, age, and search", () => {
  assert.equal(filterQueue(queue, { status: "queued" }).length, 1);
  assert.equal(filterQueue(queue, { agency: "dpw" })[0].lot, "99");
  assert.equal(filterQueue(queue, { assignee: "unassigned" }).length, 1);
  assert.equal(filterQueue(queue, { assignee: "staff-1" }).length, 1);
  assert.equal(filterQueue(queue, { olderThanDays: 30, now: "2026-11-10T00:00:00.000Z" }).length, 1);
  assert.equal(filterQueue(queue, { q: "demo-2026" })[0].id, "s2");
  assert.equal(filterQueue(queue, { permitType: "business_license" }).length, 0);
  const more = [...queue, { ...queue[1], id: "s3", status: "approved" }];
  assert.equal(filterQueue(more, { status: "open" }).length, 2, "open leaves finished steps out");
  assert.equal(filterQueue(more, { status: "all" }).length, 3);
});

test("the backlog counts what is open at each agency and how long the oldest has waited", () => {
  const now = new Date("2026-11-10T00:00:00.000Z").getTime();
  const rows = backlog(
    [
      ...queue,
      { ...queue[1], id: "s3", status: "info_requested" },
      { ...queue[1], id: "s4", status: "approved" },
      { ...queue[0], id: "s5", updatedAt: "2026-11-08T00:00:00.000Z" },
    ],
    now,
  );
  assert.deepEqual(rows, [
    { agency: "gwa", open: 2, onApplicant: 0, oldestDays: 40 },
    { agency: "dpw", open: 1, onApplicant: 1, oldestDays: 1 },
  ]);
  assert.equal(waitingDays("2026-11-09T12:00:00.000Z", now), 0);
  assert.equal(waitingLabel(0), "Moved today");
  assert.equal(waitingLabel(1), "Waiting 1 day");
  assert.equal(waitingLabel(40), "Waiting 40 days");
});

test("the committed seed does not contain a demo password", () => {
  const seed = fs.readFileSync("supabase/seed.sql", "utf8");
  assert.equal(seed.includes("PermitGU-local-demo"), false);
  assert.equal(seed.includes("crypt("), false);
  assert.match(seed, /SEED_PASSWORD/);
});

test("the audit viewer filters action, role, and text", () => {
  const rows = [
    { id: "1", action: "view_application", actorRole: "reviewer", visibility: "citizen", memo: "opened the file", applicationId: "a1", ip: "203.0.113.4", createdAt: "2026-11-01" },
    { id: "2", action: "sign_in", actorRole: "citizen", visibility: "citizen", memo: null, applicationId: null, ip: "198.51.100.8", createdAt: "2026-11-02" },
  ];
  assert.equal(filterAudit(rows, { action: "sign_in" }).length, 1);
  assert.equal(filterAudit(rows, { role: "reviewer" })[0].id, "1");
  assert.equal(filterAudit(rows, { q: "203.0.113.4" })[0].action, "view_application");
});

test("a finished or closed file says so, and an open one names its step", () => {
  assert.deepEqual(fileHeadline("issued", steps, "license"), { kind: "closed", text: "Your license was issued." });
  assert.deepEqual(fileHeadline("denied", steps, "permit"), { kind: "closed", text: "This application was denied." });
  assert.equal(fileHeadline("awaiting_applicant", steps, "permit").kind, "waiting");
  const open = fileHeadline("clearances_in_progress", steps, "permit");
  assert.equal(open.kind === "step" && open.step.name, "Zoning");
  const idle = steps.map((step) => ({ ...step, status: "approved" }));
  assert.equal(fileHeadline("fees_due", idle, "permit").kind, "between");
});

test("the history lists changes and counts opens in one line", () => {
  const events = [
    { id: "5", action: "view_application", memo: null, createdAt: "2026-11-15T10:05:00Z", actorRole: "citizen" },
    { id: "4", action: "submit", memo: null, createdAt: "2026-11-15T10:04:00Z", actorRole: "citizen" },
    { id: "3", action: "view_application", memo: null, createdAt: "2026-11-15T10:03:00Z", actorRole: "citizen" },
    { id: "2", action: "upload_document", memo: "plans.pdf", createdAt: "2026-11-15T10:02:00Z", actorRole: "citizen" },
  ];
  const split = splitTimeline(events);
  assert.deepEqual(split.changes.map((event) => event.id), ["4", "2"]);
  assert.equal(split.views, 2);
  assert.equal(split.lastView, "2026-11-15T10:05:00Z");
  assert.equal(timelineLabel("submit"), "Submitted");
  assert.equal(timelineLabel("fees_paid_in_person"), "Fee marked paid in person");
  assert.equal(timelineLabel("something_new"), "Something new");
});

test("confirmations come from a fixed list, never from the address", () => {
  assert.equal(noticeText("submitted"), "Submitted. The lead agency now has your file.");
  assert.equal(noticeText("<script>alert(1)</script>"), null);
  assert.equal(noticeText("constructor"), null);
  assert.equal(noticeText(undefined), null);
  assert.equal(staffNotice("review_step", "in_progress"), "started");
  assert.equal(staffNotice("review_step", "approved"), "approved");
  assert.equal(staffNotice("route_step", "queued"), "routed");
  assert.equal(staffNotice("route_step", "n_a"), "not_needed");
  assert.equal(staffNotice("issue_permit"), "issued");
  assert.equal(staffNotice("unknown"), null);
  for (const code of ["started", "approved", "routed", "not_needed", "issued", "fee_entered", "fee_paid", "info_requested", "denied", "expired", "assigned", "reopened"]) {
    assert.ok(noticeText(code), code);
  }
  assert.equal(withNotice("/review/abc", "approved"), "/review/abc?done=approved");
  assert.equal(withNotice("/review?status=queued", "approved"), "/review?status=queued&done=approved");
  assert.equal(withNotice("/review/abc", null), "/review/abc");
});
