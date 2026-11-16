import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const prelude = fs.readFileSync("tests/rls.test.ts", "utf8").match(/const prelude = `([\s\S]*?)`;/)?.[1];
const USERS = [1, 2, 3, 4].map((n) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`);

test("steps are timed, and estimates appear only after three finished files", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const typeId = (await db.query<{ id: string }>("select id from public.application_types where code = 'building_permit_residential_one_family'")).rows[0].id;
  const stepId = (await db.query<{ id: string; agency_id: string }>("select id, agency_id from public.workflow_steps where code = 'dlm_zoning'")).rows[0];

  const steps: string[] = [];
  for (const [index, user] of USERS.entries()) {
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${user}', 'eta${index}.demo@example.com', '{"full_name":"Eta Demo"}')`);
    const app = await db.query<{ id: string }>(
      `insert into public.applications (applicant_id, application_type_id, status) values ('${user}', '${typeId}', 'draft') returning id`,
    );
    const row = await db.query<{ id: string; started_at: string | null }>(
      `insert into public.application_steps (application_id, workflow_step_id, agency_id) values ($1, $2, $3) returning id, started_at`,
      [app.rows[0].id, stepId.id, stepId.agency_id],
    );
    assert.equal(row.rows[0].started_at, null);
    steps.push(row.rows[0].id);
  }

  await db.query("update public.application_steps set status = 'queued' where id = any($1)", [steps]);
  const started = await db.query<{ n: string }>("select count(*)::text as n from public.application_steps where started_at is not null and decided_at is null");
  assert.equal(started.rows[0].n, "4");

  // Two approvals are not enough to show a number.
  await db.query("update public.application_steps set status = 'approved' where id = any($1)", [steps.slice(0, 2)]);
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 0);
  assert.equal((await db.query("select * from public.step_estimates(1)")).rows.length, 0);

  // A rejection is timed but never counted toward the usual wait.
  await db.query("update public.application_steps set status = 'rejected' where id = $1", [steps[3]]);
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 0);

  await db.query("update public.application_steps set status = 'approved' where id = $1", [steps[2]]);
  // Give the three approved steps known durations of 2, 4, and 9 days.
  for (const [index, days] of [2, 4, 9].entries()) {
    await db.query(`update public.application_steps set started_at = decided_at - interval '${days} days' where id = $1`, [steps[index]]);
  }
  const estimates = await db.query<{ code: string; samples: number; median_seconds: string }>("select * from public.step_estimates()");
  assert.equal(estimates.rows.length, 1);
  assert.equal(estimates.rows[0].code, "dlm_zoning");
  assert.equal(estimates.rows[0].samples, 3);
  assert.equal(Number(estimates.rows[0].median_seconds), 4 * 86400);

  // Reopening clears the decision time and keeps the original start.
  await db.query("update public.application_steps set status = 'in_progress' where id = $1", [steps[0]]);
  const reopened = await db.query<{ started_at: string | null; decided_at: string | null }>("select started_at, decided_at from public.application_steps where id = $1", [steps[0]]);
  assert.ok(reopened.rows[0].started_at);
  assert.equal(reopened.rows[0].decided_at, null);
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 0);

  // A signed-in citizen can read the estimates. Anonymous visitors cannot.
  await db.exec("begin");
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: USERS[0], aal: "aal1", role: "authenticated" })}', true)`);
  await db.exec("set local role authenticated");
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 0);
  await db.exec("rollback");
  await db.exec("begin");
  await db.exec("set local role anon");
  await assert.rejects(db.query("select * from public.step_estimates()"), /permission denied/);
  await db.exec("rollback");
});

test("the catalog cleanup removes count rows and keeps every real agency", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const junk = await db.query<{ n: string }>("select count(*)::text as n from public.agencies where code in ('count', '58numberedrows', 'approxcount', '40', '57', '20', '1')");
  assert.equal(junk.rows[0].n, "0");
  const total = await db.query<{ n: string }>("select count(*)::text as n from public.agencies");
  assert.ok(Number(total.rows[0].n) >= 79, `agencies ${total.rows[0].n}`);
  const cpa = await db.query<{ agency_code: string }>("select agency_code from public.permit_catalog where code = 'cpa-accountancy'");
  assert.equal(cpa.rows[0].agency_code, "gboa");
  const orphans = await db.query<{ n: string }>("select count(*)::text as n from public.permit_catalog p where p.agency_code is not null and not exists (select 1 from public.agencies a where a.code = p.agency_code)");
  assert.equal(orphans.rows[0].n, "0");
});

test("corrections can be sent by anyone and read only by a verified super admin", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const ADMIN = USERS[0];
  const CITIZEN = USERS[1];
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin.demo@example.com', '{"full_name":"Admin Demo"}'),
      ('${CITIZEN}', 'citizen.demo@example.com', '{"full_name":"Citizen Demo"}');
    insert into public.memberships (user_id, agency_id, role) values ('${ADMIN}', null, 'super_admin');
  `);
  const as = async <T>(role: string, uid: string | null, aal: string, fn: () => Promise<T>) => {
    await db.exec("begin");
    if (uid) await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, aal, role })}', true)`);
    await db.exec(`set local role ${role}`);
    try {
      const value = await fn();
      await db.exec("commit");
      return value;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  };

  // An anonymous visitor can send one, and cannot read the table or reach the private schema.
  await as("anon", null, "aal1", () => db.query("select public.submit_contribution('Zoning', 'The variance fee changed.', 'https://dlm.guam.gov', 'me@example.com')"));
  await assert.rejects(as("anon", null, "aal1", () => db.query("select * from public.contributions")), /permission denied/);
  await assert.rejects(as("anon", null, "aal1", () => db.query("select private.submit_contribution('a', 'b', null, null)")), /permission denied/);
  await assert.rejects(as("anon", null, "aal1", () => db.query("insert into public.contributions (topic, detail) values ('a', 'b')")), /permission denied/);

  // Bad input is refused.
  await assert.rejects(as("anon", null, "aal1", () => db.query("select public.submit_contribution('', 'x', null, null)")), /not_ready/);
  await assert.rejects(as("anon", null, "aal1", () => db.query("select public.submit_contribution('t', 'x', 'javascript:alert(1)', null)")), /bad_source/);
  await assert.rejects(as("anon", null, "aal1", () => db.query(`select public.submit_contribution('t', '${"x".repeat(3001)}', null, null)`)), /too_long/);

  // A citizen and a super admin without the second factor see nothing.
  assert.equal((await as("authenticated", CITIZEN, "aal1", () => db.query("select id from public.contributions"))).rows.length, 0);
  assert.equal((await as("authenticated", ADMIN, "aal1", () => db.query("select id from public.contributions"))).rows.length, 0);
  await assert.rejects(as("authenticated", ADMIN, "aal1", () => db.query("select public.set_contribution_status(1, 'reviewed')")), /forbidden/);
  await assert.rejects(as("authenticated", CITIZEN, "aal2", () => db.query("select public.set_contribution_status(1, 'reviewed')")), /forbidden/);

  // A verified super admin reads it and files it.
  const seen = await as("authenticated", ADMIN, "aal2", () => db.query<{ id: string; topic: string; contact: string; status: string }>("select id, topic, contact, status from public.contributions"));
  assert.equal(seen.rows.length, 1);
  assert.equal(seen.rows[0].topic, "Zoning");
  assert.equal(seen.rows[0].status, "new");
  await as("authenticated", ADMIN, "aal2", () => db.query(`select public.set_contribution_status(${seen.rows[0].id}, 'reviewed')`));
  const after = await db.query<{ status: string }>("select status from public.contributions");
  assert.equal(after.rows[0].status, "reviewed");

  // The catalog carries every agency a permit touches.
  const house = await db.query<{ n: number }>("select cardinality(agency_codes) as n from public.permit_catalog where trackable and application_type_code = 'building_permit_residential_one_family'");
  assert.equal(house.rows[0].n, 14);
  const license = await db.query<{ agency_codes: string[] }>("select agency_codes from public.permit_catalog where code = 'new-business-license-form-bl-01'");
  assert.deepEqual(license.rows[0].agency_codes.slice(0, 3), ["drt", "dlm", "dpw"]);
  const missing = await db.query<{ n: string }>("select count(*)::text as n from public.permit_catalog p, unnest(p.agency_codes) c where not exists (select 1 from public.agencies a where a.code = c)");
  assert.equal(missing.rows[0].n, "0");
});

test("test files are left out of the time estimates", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const typeId = (await db.query<{ id: string }>("select id from public.application_types where code = 'building_permit_residential_one_family'")).rows[0].id;
  const step = (await db.query<{ id: string; agency_id: string }>("select id, agency_id from public.workflow_steps where code = 'dlm_zoning'")).rows[0];
  const apps: string[] = [];
  for (const [index, user] of USERS.entries()) {
    await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${user}', 'flag${index}.demo@example.com', '{"full_name":"Flag Demo"}')`);
    const app = await db.query<{ id: string }>(`insert into public.applications (applicant_id, application_type_id, status) values ('${user}', '${typeId}', 'draft') returning id`);
    apps.push(app.rows[0].id);
    await db.query(
      "insert into public.application_steps (application_id, workflow_step_id, agency_id, status, started_at, decided_at) values ($1, $2, $3, 'approved', now() - interval '3 days', now())",
      [app.rows[0].id, step.id, step.agency_id],
    );
  }
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 1, "four finished files give an estimate");
  await db.query("update public.applications set is_test = true where id = any($1)", [apps.slice(0, 2)]);
  assert.equal((await db.query("select * from public.step_estimates()")).rows.length, 0, "two real files are not enough");
  await db.query("update public.applications set is_test = false where id = $1", [apps[0]]);
  const back = await db.query<{ samples: number }>("select samples from public.step_estimates()");
  assert.equal(back.rows[0].samples, 3);

  // Only a verified super admin can change the flag.
  await db.exec(`insert into public.memberships (user_id, agency_id, role) values ('${USERS[3]}', null, 'super_admin')`);
  const as = async (uid: string, aal: string, sql: string) => {
    await db.exec("begin");
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, aal, role: "authenticated" })}', true)`);
    await db.exec("set local role authenticated");
    try { await db.query(sql); await db.exec("commit"); } catch (error) { await db.exec("rollback"); throw error; }
  };
  await assert.rejects(as(USERS[0], "aal2", `select public.set_test_file('${apps[2]}', true)`), /not_authorized/);
  await assert.rejects(as(USERS[3], "aal1", `select public.set_test_file('${apps[2]}', true)`), /mfa_required/);
  await assert.rejects(as(USERS[0], "aal1", `update public.applications set is_test = true where id = '${apps[0]}'`), /permission denied/);
  await as(USERS[3], "aal2", `select public.set_test_file('${apps[2]}', true)`);
  assert.equal((await db.query<{ is_test: boolean }>("select is_test from public.applications where id = $1", [apps[2]])).rows[0].is_test, true);
});
