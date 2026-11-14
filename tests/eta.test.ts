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
