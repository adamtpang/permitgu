import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { staffAccessDecision } from "./access";
import { filterAudit } from "./audit-view";
import { filterQueue, type QueueItem } from "./queue";
import { agencyRollup, currentStep, type TrackerStep } from "./tracker-model";

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
