import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const CITIZEN = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const DLM = "44444444-4444-4444-8444-444444444444";

const prelude = fs.readFileSync("tests/rls.test.ts", "utf8").match(/const prelude = `([\s\S]*?)`;/)?.[1];

function claims(uid: string, aal: string) {
  return JSON.stringify({ sub: uid, aal, role: "authenticated" }).replaceAll("'", "''");
}

async function withUser<T>(db: PGlite, uid: string, aal: string, fn: () => Promise<T>) {
  await db.exec("begin");
  await db.exec(`select set_config('request.jwt.claims', '${claims(uid, aal)}', true)`);
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

test("a citizen file is tracked, audited, and hidden from an unassigned agency", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const agencies = await db.query<{ n: string }>("select count(*)::text as n from public.agencies");
  const permits = await db.query<{ n: string }>("select count(*)::text as n from public.permit_catalog");
  assert.ok(Number(agencies.rows[0].n) >= 55);
  assert.ok(Number(permits.rows[0].n) >= 90);

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CITIZEN}', 'maria.cruz.demo@example.com', '{"full_name":"Maria Cruz"}'),
      ('${OTHER}', 'juan.dela.cruz.demo@example.com', '{"full_name":"Juan Dela Cruz"}'),
      ('${DLM}', 'paolo.duenas.demo@example.com', '{"full_name":"Paolo Duenas"}');
    insert into public.memberships (user_id, agency_id, role)
    select '${DLM}', id, 'reviewer' from public.agencies where code = 'dlm';
  `);
  const typeId = (await db.query<{ id: string }>("select id from public.application_types where code = 'building_permit_residential_one_family'")).rows[0].id;

  const created = await withUser(db, CITIZEN, "aal1", () =>
    db.query<{ id: string }>(
      `insert into public.applications (applicant_id, application_type_id, status, lot, tract, block, zoning_district, ownership, scope, sewage, water_supply, contractor_license, attestation, attestation_name)
       values ('${CITIZEN}', '${typeId}', 'draft', '12', '4', '2', 'R1 example', 'owner', 'New house', 'public_sewer', 'public', 'CLB-DEMO-100', true, 'Maria Cruz')
       returning id`,
    ),
  );
  const appId = created.rows[0].id;

  let missingDocs = false;
  try {
    await withUser(db, CITIZEN, "aal1", () => db.exec(`select public.submit_application('${appId}')`));
  } catch (error) {
    missingDocs = true;
    assert.match(String(error), /not_ready/);
  }
  assert.equal(missingDocs, true);

  await withUser(db, CITIZEN, "aal1", () => db.exec(`
    insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size) values
      ('${appId}', '${CITIZEN}', 'plans', '${appId}/plans.pdf', 'plans.pdf', 'application/pdf', 20),
      ('${appId}', '${CITIZEN}', 'plot_plan', '${appId}/plot.pdf', 'plot.pdf', 'application/pdf', 20);
    select public.submit_application('${appId}');
    select public.record_event('${appId}', 'view_application', 'application', '${appId}', 'opened the tracker', '203.0.113.10', 'PermitGU test');
  `));

  const status = await db.query<{ status: string }>("select status from public.applications where id = $1", [appId]);
  assert.equal(status.rows[0].status, "submitted");
  const view = await db.query<{ ip: string; actor_role: string }>(
    "select ip, actor_role from public.audit_log where application_id = $1 and action = 'view_application'",
    [appId],
  );
  assert.equal(view.rows[0].ip, "203.0.113.10");
  assert.equal(view.rows[0].actor_role, "citizen");

  let blocked = false;
  try {
    await withUser(db, OTHER, "aal1", () => db.exec(`select public.record_event('${appId}', 'view_application', 'application', '${appId}', 'nope', '198.51.100.2', 'spy')`));
  } catch (error) {
    blocked = true;
    assert.match(String(error), /not_found/);
  }
  assert.equal(blocked, true);

  const hidden = await withUser(db, DLM, "aal2", () => db.query("select id from public.applications"));
  assert.equal(hidden.rows.length, 0);

  await db.exec(`
    update public.application_steps s set assignee_id = '${DLM}'
    from public.workflow_steps w
    where s.workflow_step_id = w.id and s.application_id = '${appId}' and w.code = 'dlm_zoning'
  `);
  const assigned = await withUser(db, DLM, "aal2", () => db.query("select id from public.applications"));
  assert.equal(assigned.rows.length, 1);
  const files = await withUser(db, DLM, "aal2", () => db.query("select id from public.documents"));
  assert.equal(files.rows.length, 2);

  let rewritten = false;
  try {
    await db.exec("update public.audit_log set memo = 'changed'");
  } catch (error) {
    rewritten = true;
    assert.match(String(error), /append-only/);
  }
  assert.equal(rewritten, true);
});
