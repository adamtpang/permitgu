import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const prelude = fs.readFileSync("tests/rls.test.ts", "utf8").match(/const prelude = `([\s\S]*?)`;/)?.[1];
const ADMIN = "33333333-3333-4333-8333-333333333333";
const CITIZEN = "11111111-1111-4111-8111-111111111111";
const TYPES = ["building_permit_residential_one_family", "business_license_new", "x_clearing_grading", "x_contractor_license", "x_health_certificate_food", "x_park_reservation", "x_power_service", "x_repair_permit", "x_road_work", "x_sanitary_permit_food", "x_temporary_alcohol_license", "x_temporary_food_event", "x_water_service", "x_zone_change", "x_zone_variance"];

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

test("the sample seed gives every tracked permit finished files, open work, and an estimate for each step", async () => {
  assert.ok(prelude);
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }
  const seed = fs.readFileSync("supabase/seeds/sample_files.sql", "utf8");
  await db.exec(seed);

  // Five files per permit: three finished, two still moving. All marked as samples.
  const files = await db.query<{ code: string; status: string; n: string }>(`
    select t.code, a.status, count(*)::text as n from public.applications a
    join public.application_types t on t.id = a.application_type_id
    where a.is_sample group by t.code, a.status order by t.code, a.status`);
  const byType = new Map<string, Record<string, number>>();
  for (const row of files.rows) byType.set(row.code, { ...(byType.get(row.code) ?? {}), [row.status]: Number(row.n) });
  for (const code of TYPES) {
    const statuses = byType.get(code) ?? {};
    const finished = (statuses.issued ?? 0) + (statuses.inspections ?? 0);
    assert.equal(finished, 3, `${code} finished: ${JSON.stringify(statuses)}`);
    assert.equal(Object.values(statuses).reduce((sum, count) => sum + count, 0), 5, code);
  }
  assert.equal((await db.query("select 1 from public.applications where not is_sample")).rows.length, 0);

  // Every step a new file will wait on has an estimate, and it says it came from sample files.
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${CITIZEN}', 'owner.demo@example.com', '{"full_name":"Owner Demo"}'), ('${ADMIN}', 'admin.demo@example.com', '{"full_name":"Admin Demo"}');
    insert into public.memberships (user_id, agency_id, role) values ('${ADMIN}', null, 'super_admin');`);
  for (const code of TYPES) {
    const estimates = await as(db, CITIZEN, "aal1", () =>
      db.query<{ code: string; samples: number; median_seconds: string; sample_files: number }>(`select * from public.step_estimates_for('${code}')`));
    const known = new Set(estimates.rows.map((row) => row.code));
    const needed = await db.query<{ code: string }>(`
      select w.code from public.workflow_steps w join public.application_types t on t.id = w.application_type_id
      where t.code = '${code}' and w.routing in ('always', 'default_routed') and w.phase in ('intake', 'plan_review', 'clearance', 'fees', 'issuance')`);
    for (const row of needed.rows) assert.ok(known.has(row.code), `${code} has no estimate for ${row.code}`);
    for (const row of estimates.rows) {
      // A step a file in progress has already passed counts too.
      assert.ok(row.samples >= 3 && row.samples <= 5, `${code} ${row.code}`);
      assert.equal(row.sample_files, row.samples, "the estimate knows its files are samples");
      assert.ok(Number(row.median_seconds) >= 86400, `${code} ${row.code} takes at least a day`);
    }
  }

  // The sample accounts cannot be used: no password, and an address nobody receives.
  const people = await db.query<{ email: string }>("select email from auth.users where email like 'sample.%'");
  assert.ok(people.rows.length >= 8);
  assert.ok(people.rows.every((row) => row.email.endsWith("@example.com")));
  assert.equal((await db.query("select 1 from public.memberships m join auth.users u on u.id = m.user_id where u.email like 'sample.%' and m.role in ('super_admin', 'agency_admin')")).rows.length, 0, "no sample account has admin rights");

  // Open sample work has been waiting for days, so the staff queue has something to show.
  const waiting = await db.query<{ n: string; oldest: string }>(`
    select count(*)::text as n, max(extract(day from now() - s.updated_at))::text as oldest
    from public.application_steps s where s.status in ('queued', 'in_progress')`);
  assert.ok(Number(waiting.rows[0].n) >= 8);
  assert.ok(Number(waiting.rows[0].oldest) >= 5);

  // Running the seed again changes nothing.
  await db.exec(seed);
  assert.equal((await db.query<{ n: string }>("select count(*)::text as n from public.applications")).rows[0].n, "75");

  // A super admin retires them in one step. Estimates then have nothing to stand on.
  await assert.rejects(as(db, CITIZEN, "aal1", () => db.query("select public.retire_sample_files()")), /mfa_required/);
  const retired = await as(db, ADMIN, "aal2", () => db.query<{ n: number }>("select public.retire_sample_files() as n"));
  assert.equal(retired.rows[0].n, 75);
  assert.equal((await as(db, CITIZEN, "aal1", () => db.query("select * from public.step_estimates_for('business_license_new')"))).rows.length, 0);
});
