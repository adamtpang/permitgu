import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { LICENSE_STEPS, validateLicense, fileTitle, permitKind, type LicenseInput } from "../lib/license";

const prelude = fs.readFileSync("tests/rls.test.ts", "utf8").match(/const prelude = `([\s\S]*?)`;/)?.[1];
const CITIZEN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const DRT = "33333333-3333-4333-8333-333333333333";
const DLM = "44444444-4444-4444-8444-444444444444";
const DPW = "55555555-5555-4555-8555-555555555555";

async function database() {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  return db;
}

async function as<T>(db: PGlite, uid: string, aal: string, fn: () => Promise<T>) {
  await db.exec("begin");
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, aal, role: "authenticated" })}', true)`);
  await db.exec("set local role authenticated");
  try {
    const value = await fn();
    await db.exec("commit");
    return value;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

const DETAILS = JSON.stringify({ business_name: "Tasi Coffee", trade_name: "", entity_type: "sole_proprietor", registration_number: "", street: "123 Marine Corps Drive", village: "Tamuning", extra: "dropped" });

test("the migration seeds every business license step from the shared list", async () => {
  const db = await database();
  const rows = await db.query<{ code: string; phase: string; routing: string; agency: string }>(
    `select w.code, w.phase, w.routing, a.code as agency from public.workflow_steps w
     join public.application_types t on t.id = w.application_type_id
     join public.agencies a on a.id = w.agency_id
     where t.code = 'business_license_new' order by w.sort_order`,
  );
  assert.deepEqual(rows.rows, LICENSE_STEPS.map((step) => ({ code: step.code, phase: step.phase, routing: step.routing, agency: step.agency })));
  const house = await db.query<{ n: string }>("select count(*)::text as n from public.workflow_steps w join public.application_types t on t.id = w.application_type_id where t.code = 'building_permit_residential_one_family'");
  assert.equal(house.rows[0].n, "27");
});

test("a business license goes from draft to issued, and only the right people see it", async () => {
  const db = await database();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CITIZEN}', 'owner.demo@example.com', '{"full_name":"Owner Demo"}'),
      ('${OTHER}', 'other.demo@example.com', '{"full_name":"Other Demo"}'),
      ('${DRT}', 'drt.demo@example.com', '{"full_name":"DRT Demo"}'),
      ('${DLM}', 'dlm.demo@example.com', '{"full_name":"DLM Demo"}'),
      ('${DPW}', 'dpw.demo@example.com', '{"full_name":"DPW Demo"}');
    insert into public.memberships (user_id, agency_id, role) select '${DRT}', id, 'reviewer' from public.agencies where code = 'drt';
    insert into public.memberships (user_id, agency_id, role) select '${DLM}', id, 'reviewer' from public.agencies where code = 'dlm';
    insert into public.memberships (user_id, agency_id, role) select '${DPW}', id, 'reviewer' from public.agencies where code = 'dpw';
  `);

  // A draft needs a name and a kind of business.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.create_license_draft('{"business_name":""}'::jsonb, '', '', '', false, '')`)), /not_ready/);
  const created = await as(db, CITIZEN, "aal1", () =>
    db.query<{ id: string }>(`select public.create_license_draft('${DETAILS}'::jsonb, '', '', '', false, '') as id`),
  );
  const id = created.rows[0].id;
  const stored = await db.query<{ details: Record<string, string>; status: string; applicant_id: string }>("select details, status, applicant_id from public.applications where id = $1", [id]);
  assert.equal(stored.rows[0].status, "draft");
  assert.equal(stored.rows[0].applicant_id, CITIZEN);
  assert.equal(stored.rows[0].details.business_name, "Tasi Coffee");
  assert.equal("extra" in stored.rows[0].details, false, "unknown keys are dropped");

  // Someone else cannot edit or submit it.
  await assert.rejects(as(db, OTHER, "aal1", () => db.query(`select public.save_license_draft('${id}', '${DETAILS}'::jsonb, '1', '2', 'x', true, 'x')`)), /not_found/);
  await assert.rejects(as(db, OTHER, "aal1", () => db.query(`select public.submit_application('${id}')`)), /not_found/);
  // A citizen cannot write details directly.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`update public.applications set details = '{"business_name":"x"}'::jsonb where id = '${id}'`)), /permission denied/);

  // Submit needs the location, the activity, the attestation, and both papers.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.submit_application('${id}')`)), /not_ready/);
  await as(db, CITIZEN, "aal1", () => db.query(`select public.save_license_draft('${id}', '${DETAILS}'::jsonb, '5', '2', 'Retail: sale of coffee', true, 'Owner Demo')`));
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.submit_application('${id}')`)), /not_ready/);
  await as(db, CITIZEN, "aal1", () => db.exec(`
    insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size) values
      ('${id}', '${CITIZEN}', 'bl01', '${id}/bl01.pdf', 'bl01.pdf', 'application/pdf', 20),
      ('${id}', '${CITIZEN}', 'good_moral', '${id}/moral.pdf', 'moral.pdf', 'application/pdf', 20);
    select public.submit_application('${id}');
  `));

  const step = async (code: string) =>
    (await db.query<{ id: string; status: string }>(
      "select s.id, s.status from public.application_steps s join public.workflow_steps w on w.id = s.workflow_step_id where s.application_id = $1 and w.code = $2",
      [id, code],
    )).rows[0];
  const status = async () => (await db.query<{ status: string }>("select status from public.applications where id = $1", [id])).rows[0].status;
  const approve = async (uid: string, code: string) => {
    const row = await step(code);
    if (row.status === "queued") await as(db, uid, "aal2", () => db.query(`select public.review_step('${row.id}', 'in_progress', null)`));
    await as(db, uid, "aal2", () => db.query(`select public.review_step('${row.id}', 'approved', null)`));
  };

  assert.equal(await status(), "submitted");
  assert.equal((await step("bl_intake")).status, "queued");

  // Revenue and Taxation leads this permit and sees it. Public Works, which leads the house permit, does not.
  assert.equal((await as(db, DRT, "aal2", () => db.query("select id from public.applications"))).rows.length, 1);
  assert.equal((await as(db, DPW, "aal2", () => db.query("select id from public.applications"))).rows.length, 0);
  assert.equal((await as(db, DLM, "aal2", () => db.query("select id from public.applications"))).rows.length, 0);
  assert.equal((await as(db, DRT, "aal1", () => db.query("select id from public.applications"))).rows.length, 0, "no second factor, no queue");

  // Intake clears straight into clearances. There is no plan review.
  await approve(DRT, "bl_intake");
  assert.equal(await status(), "clearances_in_progress");
  for (const code of ["bl_grt", "bl_income_tax", "bl_collections", "bl_dlm_zoning"]) assert.equal((await step(code)).status, "queued", code);
  for (const code of ["bl_dpw", "bl_gfd", "bl_dphss", "bl_gpd"]) assert.equal((await step(code)).status, "not_started", code);

  // Land Management now has a step, so it sees the file. It cannot approve a tax clearance.
  assert.equal((await as(db, DLM, "aal2", () => db.query("select id from public.applications"))).rows.length, 1);
  const grt = await step("bl_grt");
  await assert.rejects(as(db, DLM, "aal2", () => db.query(`select public.review_step('${grt.id}', 'in_progress', null)`)), /wrong_agency/);

  await approve(DRT, "bl_grt");
  await approve(DRT, "bl_income_tax");
  await approve(DRT, "bl_collections");
  assert.equal(await status(), "clearances_in_progress", "zoning still open");
  await approve(DLM, "bl_dlm_zoning");
  assert.equal(await status(), "fees_due");

  // Fees, payment in person, then the license. Nothing queues inspections.
  await assert.rejects(as(db, DLM, "aal2", () => db.query(`select public.assess_fees('${id}', 5000, 'Service business')`)), /not_orchestrator/);
  await as(db, DRT, "aal2", () => db.query(`select public.assess_fees('${id}', 5000, 'Service business fee entered by staff')`));
  await assert.rejects(as(db, DRT, "aal2", () => db.query(`select public.issue_permit('${id}', 'Too early')`)), /fees_not_paid/);
  await as(db, DRT, "aal2", () => db.query(`select public.mark_fees_paid('${id}', 'Paid in person at pickup')`));
  const issued = await as(db, DRT, "aal2", () => db.query<{ n: string }>(`select public.issue_permit('${id}', 'License issued in this demo') as n`));
  assert.match(issued.rows[0].n, /^DEMO-\d{4}-\d{4}$/);
  assert.equal(await status(), "issued");
  assert.equal((await step("bl_issue")).status, "approved");

  // Every step that ran was timed, so the license feeds the same estimates as the house permit.
  const timed = await db.query<{ n: string }>("select count(*)::text as n from public.application_steps where application_id = $1 and status = 'approved' and started_at is not null and decided_at is not null", [id]);
  assert.equal(timed.rows[0].n, "8");
  // The citizen sees their own file and its history.
  const mine = await as(db, CITIZEN, "aal1", () => db.query<{ permit_number: string }>("select permit_number from public.applications"));
  assert.equal(mine.rows.length, 1);
  assert.equal(mine.rows[0].permit_number, issued.rows[0].n);
});

test("license fields are checked before they reach the database", () => {
  const base: LicenseInput = { businessName: "Tasi Coffee", tradeName: "", entityType: "sole_proprietor", registrationNumber: "", activity: "Retail: coffee", lot: "5", block: "2", street: "123 Marine Corps Drive", village: "Tamuning", attestation: true, attestationName: "Owner Demo" };
  assert.equal(validateLicense(base, "submit"), null);
  assert.match(validateLicense({ ...base, businessName: " " }, "save") ?? "", /business name/);
  assert.match(validateLicense({ ...base, entityType: "club" }, "save") ?? "", /kind of business/);
  assert.equal(validateLicense({ ...base, village: "" }, "save"), null, "a draft can be saved without the location");
  assert.match(validateLicense({ ...base, village: "" }, "submit") ?? "", /village/);
  assert.match(validateLicense({ ...base, entityType: "llc" }, "submit") ?? "", /registration number/);
  assert.equal(validateLicense({ ...base, entityType: "llc", registrationNumber: "D-1234" }, "submit"), null);
  assert.match(validateLicense({ ...base, attestation: false }, "submit") ?? "", /attestation/);
  assert.match(validateLicense({ ...base, activity: "x".repeat(2001) }, "save") ?? "", /too long/);
  assert.equal(fileTitle("business_license_new", { details: { business_name: "Tasi Coffee" } }), "Tasi Coffee");
  assert.equal(fileTitle("building_permit_residential_one_family", { lot: "12" }), "Lot 12");
  assert.deepEqual(permitKind("business_license_new").pipeline, ["draft", "submitted", "intake", "clearances_in_progress", "fees_due", "issued"]);
  assert.equal(permitKind(null).pipeline.includes("inspections"), true);
});
