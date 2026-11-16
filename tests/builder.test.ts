import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { fileTitle, permitKind } from "../lib/license";
import { parseFields, validateBuilt } from "../lib/permit-types";

const prelude = fs.readFileSync("tests/rls.test.ts", "utf8").match(/const prelude = `([\s\S]*?)`;/)?.[1];
const CITIZEN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const DPHSS = "44444444-4444-4444-8444-444444444444";
const GFD = "55555555-5555-4555-8555-555555555555";

async function database() {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  return db;
}

async function as<T>(db: PGlite, uid: string | null, aal: string, fn: () => Promise<T>) {
  await db.exec("begin");
  if (uid) {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, aal, role: "authenticated" })}', true)`);
    await db.exec("set local role authenticated");
  } else {
    await db.exec("set local role anon");
  }
  try {
    const value = await fn();
    await db.exec("commit");
    return value;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

test("a super admin builds a permit, and a file runs through it to issued", async () => {
  const db = await database();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CITIZEN}', 'owner.demo@example.com', '{"full_name":"Owner Demo"}'),
      ('${OTHER}', 'other.demo@example.com', '{"full_name":"Other Demo"}'),
      ('${ADMIN}', 'admin.demo@example.com', '{"full_name":"Admin Demo"}'),
      ('${DPHSS}', 'dphss.demo@example.com', '{"full_name":"DPHSS Demo"}'),
      ('${GFD}', 'gfd.demo@example.com', '{"full_name":"GFD Demo"}');
    insert into public.memberships (user_id, agency_id, role) values ('${ADMIN}', null, 'super_admin');
    insert into public.memberships (user_id, agency_id, role) select '${DPHSS}', id, 'reviewer' from public.agencies where code = 'dphss';
    insert into public.memberships (user_id, agency_id, role) select '${GFD}', id, 'reviewer' from public.agencies where code = 'gfd';
  `);
  const admin = <T>(sql: string) => as(db, ADMIN, "aal2", () => db.query<T>(sql));

  // Only a super admin with a second factor can build.
  const create = `select public.create_permit_type('Sanitary permit for a food stand', 'permit', 'dphss', 'A demo permit.', 'https://dphss.guam.gov/') as code`;
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(create)), /mfa_required/);
  await assert.rejects(as(db, DPHSS, "aal2", () => db.query(create)), /not_authorized/);
  await assert.rejects(as(db, ADMIN, "aal1", () => db.query(create)), /mfa_required/);
  await assert.rejects(admin(`select public.create_permit_type('Bad link', 'permit', 'dphss', '', 'dphss.guam.gov')`), /bad_source/);
  const code = (await admin<{ code: string }>(create)).rows[0].code;
  assert.equal(code, "x_sanitary_permit_for_a_food_stand");
  await assert.rejects(admin(create), /already_exists/);

  // It starts off, with intake, fee, payment, and issue steps for the lead agency.
  const base = await db.query<{ code: string; phase: string }>(
    "select w.code, w.phase from public.workflow_steps w join public.application_types t on t.id = w.application_type_id where t.code = $1 order by w.sort_order", [code]);
  assert.deepEqual(base.rows.map((row) => row.code), ["intake", "fee_assessment", "tog_payment", "issue"]);
  assert.equal((await as(db, null, "", () => db.query("select code from public.application_types where code = $1", [code]))).rows.length, 0, "an off permit is not public");
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.create_builder_draft('${code}', '{}'::jsonb, false, '')`)), /not_found/);
  await assert.rejects(admin(`select public.set_type_active('${code}', true)`), /not_ready/);

  // Questions, steps, and papers.
  assert.equal((await admin<{ k: string }>(`select public.add_type_field('${code}', 'Name of the stand', 'text', true, null, null) as k`)).rows[0].k, "name_of_the_stand");
  await assert.rejects(admin(`select public.add_type_field('${code}', 'Name of the stand', 'text', true, null, null)`), /already_exists/);
  await assert.rejects(admin(`select public.add_type_field('${code}', 'Kind of food', 'choice', true, null, array['Only one'])`), /bad_choices/);
  await admin(`select public.add_type_field('${code}', 'Kind of food', 'choice', true, null, array['Packaged', 'Cooked on site'])`);
  await admin(`select public.add_type_field('${code}', 'Anything else', 'long', false, 'Optional.', null)`);
  await admin(`select public.add_type_field('${code}', 'Mistake', 'text', false, null, null)`);
  await admin(`select public.remove_type_field('${code}', 'mistake')`);
  await admin(`select public.add_type_step('${code}', 'Pre-operational inspection', 'dphss', 'always', 'Entered from the public record.')`);
  await admin(`select public.add_type_step('${code}', 'Fire clearance', 'gfd', 'as_indicated', 'Only for cooking on site. Not confirmed.')`);
  await admin(`select public.add_type_step('${code}', 'Wrong step', 'dpw', 'always', null)`);
  await admin(`select public.remove_type_step('${code}', 's_wrong_step')`);
  await assert.rejects(admin(`select public.remove_type_step('${code}', 'intake')`), /not_found/, "the fixed steps stay");
  await assert.rejects(admin(`select public.add_type_step('${code}', 'Odd routing', 'dphss', 'gated', null)`), /bad_routing/);
  await admin(`select public.add_type_document('${code}', 'Floor plan', 'A sketch is fine.')`);
  // The built-in permits are not edited through the builder.
  await assert.rejects(admin(`select public.add_type_step('business_license_new', 'Extra', 'drt', 'always', null)`), /built_in_permit/);
  await assert.rejects(admin(`select public.set_type_active('building_permit_residential_one_family', false)`), /built_in_permit/);

  await admin(`select public.set_type_active('${code}', true)`);
  const seen = await as(db, null, "", () => db.query<{ fields: unknown }>("select fields from public.application_types where code = $1", [code]));
  assert.equal(seen.rows.length, 1, "an on permit is public");
  assert.deepEqual(parseFields(seen.rows[0].fields).map((field) => field.key), ["name_of_the_stand", "kind_of_food", "anything_else"]);
  assert.equal((await as(db, null, "", () => db.query("select w.code from public.workflow_steps w join public.application_types t on t.id = w.application_type_id where t.code = $1", [code]))).rows.length, 6);

  // A citizen drafts it. Unknown answers are dropped and a bad choice is refused.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.create_builder_draft('${code}', '{"kind_of_food":"Raw"}'::jsonb, false, '')`)), /bad_choice/);
  const id = (await as(db, CITIZEN, "aal1", () =>
    db.query<{ id: string }>(`select public.create_builder_draft('${code}', '{"name_of_the_stand":"Tasi Shave Ice","extra":"dropped"}'::jsonb, false, '') as id`))).rows[0].id;
  const stored = await db.query<{ details: Record<string, string> }>("select details from public.applications where id = $1", [id]);
  assert.deepEqual(stored.rows[0].details, { name_of_the_stand: "Tasi Shave Ice", kind_of_food: "", anything_else: "" });
  await assert.rejects(as(db, OTHER, "aal1", () => db.query(`select public.save_builder_draft('${id}', '{}'::jsonb, true, 'x')`)), /not_found/);

  // Submit needs every required answer, the attestation, and the paper.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.submit_application('${id}')`)), /not_ready/);
  await as(db, CITIZEN, "aal1", () => db.query(`select public.save_builder_draft('${id}', '{"name_of_the_stand":"Tasi Shave Ice","kind_of_food":"Packaged"}'::jsonb, true, 'Owner Demo')`));
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query(`select public.submit_application('${id}')`)), /not_ready/, "paper missing");
  const paper = (kind: string, name: string) =>
    `insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size) values ('${id}', '${CITIZEN}', '${kind}', '${id}/${name}', '${name}', 'application/pdf', 20)`;
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.exec(paper("plans", "plans.pdf"))), /bad_document_kind/, "a house paper is not on this permit's list");
  await as(db, CITIZEN, "aal1", () => db.exec(paper("floor_plan", "floor.pdf")));
  await as(db, CITIZEN, "aal1", () => db.exec(paper("other", "extra.pdf")));
  await as(db, CITIZEN, "aal1", () => db.query(`select public.submit_application('${id}')`));

  const step = async (stepCode: string) =>
    (await db.query<{ id: string; status: string }>(
      "select s.id, s.status from public.application_steps s join public.workflow_steps w on w.id = s.workflow_step_id where s.application_id = $1 and w.code = $2", [id, stepCode])).rows[0];
  const status = async () => (await db.query<{ status: string }>("select status from public.applications where id = $1", [id])).rows[0].status;
  const approve = async (uid: string, stepCode: string) => {
    const row = await step(stepCode);
    if (row.status === "queued") await as(db, uid, "aal2", () => db.query(`select public.review_step('${row.id}', 'in_progress', null)`));
    await as(db, uid, "aal2", () => db.query(`select public.review_step('${row.id}', 'approved', null)`));
  };

  // The lead agency sees it. Fire does not, until it is routed a step.
  assert.equal((await as(db, DPHSS, "aal2", () => db.query("select id from public.applications"))).rows.length, 1);
  assert.equal((await as(db, GFD, "aal2", () => db.query("select id from public.applications"))).rows.length, 0);
  // Nothing new for the applicant until the agency acts.
  const updates = () => as(db, CITIZEN, "aal1", () => db.query<{ unread: number; last_action: string }>("select unread, last_action from public.my_file_updates()"));
  assert.equal((await updates()).rows.length, 0);
  await approve(DPHSS, "intake");
  assert.equal(await status(), "clearances_in_progress");
  const fresh = await updates();
  assert.equal(fresh.rows.length, 1);
  assert.equal(fresh.rows[0].unread, 1, "the approval. Starting a review is staff-only.");
  assert.equal(fresh.rows[0].last_action, "review_step");
  assert.equal((await as(db, OTHER, "aal1", () => db.query("select * from public.my_file_updates()"))).rows.length, 0, "only the owner is told");
  // Opening the tracker clears them.
  await as(db, CITIZEN, "aal1", () => db.query(`select public.record_event('${id}', 'view_application', 'application', '${id}', 'Opened the tracker', null, null)`));
  assert.equal((await updates()).rows.length, 0);
  assert.equal((await step("s_pre_operational_inspection")).status, "queued");
  assert.equal((await step("s_fire_clearance")).status, "not_started");
  await approve(DPHSS, "s_pre_operational_inspection");
  assert.equal(await status(), "fees_due");
  await as(db, DPHSS, "aal2", () => db.query(`select public.assess_fees('${id}', 2500, 'Fee entered by staff')`));
  await as(db, DPHSS, "aal2", () => db.query(`select public.mark_fees_paid('${id}', 'Paid in person')`));
  const issued = await as(db, DPHSS, "aal2", () => db.query<{ n: string }>(`select public.issue_permit('${id}', 'Issued in this demo') as n`));
  assert.match(issued.rows[0].n, /^DEMO-\d{4}-\d{4}$/);
  assert.equal(await status(), "issued");
  assert.equal((await step("issue")).status, "approved");

  // The admin step editor reaches any permit now, and keeps intake, fee, and issue steps on every file.
  await admin(`select public.update_type_step('${code}', 's_fire_clearance', 'default_routed', 'Now assumed for every stand. Not confirmed.')`);
  await assert.rejects(admin(`select public.update_type_step('${code}', 'intake', 'as_indicated', null)`), /fixed_step/);
  await assert.rejects(admin(`select public.update_type_step('${code}', 's_fire_clearance', 'gated', null)`), /bad_routing/);
  await admin(`select public.update_type_step('business_license_new', 'bl_gfd', 'default_routed', 'Changed in a test.')`);
  await admin(`select public.update_type_step('${code}', 'fee_assessment', 'always', 'Only the note changed.')`);
  await assert.rejects(as(db, DPHSS, "aal2", () => db.query(`select public.update_type_step('${code}', 's_fire_clearance', 'always', null)`)), /not_authorized/);
  const houseFee = await db.query<{ uncertainty: string }>("select w.uncertainty from public.workflow_steps w join public.application_types t on t.id = w.application_type_id where t.code = 'building_permit_residential_one_family' and w.code = 'fee_assessment'");
  assert.notEqual(houseFee.rows[0].uncertainty, "Only the note changed.", "another permit's step with the same code is untouched");

  // A step or paper a file already uses cannot be pulled out from under it.
  await assert.rejects(admin(`select public.remove_type_step('${code}', 's_fire_clearance')`), /step_in_use/);
  await assert.rejects(admin(`select public.remove_type_document('${code}', 'floor_plan')`), /document_in_use/);
  // Switched off, nobody new can start it. The issued file is untouched.
  await admin(`select public.set_type_active('${code}', false)`);
  await assert.rejects(as(db, OTHER, "aal1", () => db.query(`select public.create_builder_draft('${code}', '{}'::jsonb, false, '')`)), /not_found/);
  assert.equal(await status(), "issued");
  // Every builder change is in the audit log.
  const logged = await db.query<{ n: string }>("select count(*)::text as n from public.audit_log where entity = 'application_type' and action <> 'link_type_catalog'");
  // 1 create, 5 question changes, 4 step changes, 1 paper, 2 switches.
  assert.equal(logged.rows[0].n, "13");
});

test("the built permits are seeded, on, and linked to the catalog", async () => {
  const db = await database();
  const types = await as(db, null, "", () => db.query<{ code: string; noun: string; steps: string; papers: string; catalog: string }>(`
    select t.code, t.noun,
      (select count(*)::text from public.workflow_steps w where w.application_type_id = t.id) as steps,
      (select count(*)::text from public.required_documents r where r.application_type_id = t.id) as papers,
      (select c.code from public.permit_catalog c where c.application_type_code = t.code and c.trackable) as catalog
    from public.application_types t where t.builder order by t.code`));
  assert.deepEqual(types.rows, [
    { code: "x_clearing_grading", noun: "permit", steps: "10", papers: "1", catalog: "clearing-grading-stockpiling-permit-often-with-gepa" },
    { code: "x_park_reservation", noun: "approval", steps: "5", papers: "0", catalog: "park-or-pavilion-reservation" },
    { code: "x_power_service", noun: "approval", steps: "5", papers: "1", catalog: "power-service-connection" },
    { code: "x_repair_permit", noun: "permit", steps: "6", papers: "2", catalog: "building-permit-for-a-repair" },
    { code: "x_road_work", noun: "permit", steps: "5", papers: "1", catalog: "permit-for-work-in-a-public-road" },
    { code: "x_sanitary_permit_food", noun: "permit", steps: "6", papers: "2", catalog: "sanitary-permit-form-a-new-establishment" },
    { code: "x_temporary_alcohol_license", noun: "license", steps: "5", papers: "0", catalog: "temporary-alcohol-license-for-an-event" },
    { code: "x_temporary_food_event", noun: "permit", steps: "5", papers: "1", catalog: "temporary-food-service-establishment-tfse-sanitary-permit" },
    { code: "x_water_service", noun: "approval", steps: "6", papers: "3", catalog: "water-service-connection" },
    { code: "x_zone_variance", noun: "approval", steps: "9", papers: "1", catalog: "zone-variance-gluc-form-03" },
  ]);
  // No long dashes are left in what the catalog shows, and the shifted directory row is fixed.
  const dashes = await db.query<{ n: string }>("select ((select count(*) from public.permit_catalog where name like U&'%\\2014%') + (select count(*) from public.agencies where acronym like U&'%\\2014%' or name ~ '^[0-9]'))::text as n");
  assert.equal(dashes.rows[0].n, "0");
});

test("the house and license papers still pass the paper check", async () => {
  const db = await database();
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${CITIZEN}', 'owner.demo@example.com', '{"full_name":"Owner Demo"}')`);
  const id = (await as(db, CITIZEN, "aal1", () =>
    db.query<{ id: string }>(`select public.create_license_draft('{"business_name":"Tasi Coffee","entity_type":"sole_proprietor"}'::jsonb, '', '', '', false, '') as id`))).rows[0].id;
  const paper = (kind: string) =>
    `insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size) values ('${id}', '${CITIZEN}', '${kind}', '${id}/${kind}.pdf', '${kind}.pdf', 'application/pdf', 20)`;
  await as(db, CITIZEN, "aal1", () => db.exec(paper("bl01")));
  await as(db, CITIZEN, "aal1", () => db.exec(paper("other")));
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.exec(paper("plans"))), /bad_document_kind/);
});

test("built permit answers are checked before they reach the database", () => {
  const fields = parseFields([
    { key: "name", label: "Name", kind: "text", required: true, help: null, choices: [] },
    { key: "food", label: "Kind of food", kind: "choice", required: true, choices: ["Packaged", "Cooked"] },
    { key: "more", label: "More", kind: "long", required: false },
    { nonsense: true },
  ]);
  assert.equal(fields.length, 3);
  const ok = { checked: true, name: "Owner Demo" };
  assert.equal(validateBuilt(fields, { name: "Tasi" }, { checked: false, name: "" }, "save"), null, "a draft can be saved half done");
  assert.match(validateBuilt(fields, { name: "Tasi" }, ok, "submit") ?? "", /Kind of food/);
  assert.match(validateBuilt(fields, { name: "Tasi", food: "Raw" }, ok, "save") ?? "", /listed answers/);
  assert.match(validateBuilt(fields, { name: "x".repeat(201), food: "Cooked" }, ok, "save") ?? "", /too long/);
  assert.match(validateBuilt(fields, { name: "Tasi", food: "Cooked" }, { checked: false, name: "" }, "submit") ?? "", /attestation/);
  assert.equal(validateBuilt(fields, { name: "Tasi", food: "Cooked" }, ok, "submit"), null);

  const built = { builder: true, name: "Sanitary permit", noun: "permit", lead: { name: "Public Health" }, fields, documents: [{ code: "floor_plan", name: "Floor plan" }] };
  assert.equal(fileTitle("x_sanitary", { details: { name: "Tasi Shave Ice" } }, built), "Tasi Shave Ice");
  assert.equal(fileTitle("x_sanitary", { details: {} }, built), "Sanitary permit");
  const kind = permitKind("x_sanitary", built);
  assert.equal(kind.pipeline.includes("inspections"), false);
  assert.equal(kind.submitLabel, "Submit to Public Health intake");
  assert.equal(permitKind("business_license_new").noun, "license", "the built-in permits are unchanged");
});
