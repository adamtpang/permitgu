import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const CITIZEN_A = "11111111-1111-4111-8111-111111111111";
const CITIZEN_B = "99999999-9999-4999-8999-999999999999";
const DPW = "22222222-2222-4222-8222-222222222222";
const GWA = "55555555-5555-4555-8555-555555555555";
const DLM = "44444444-4444-4444-8444-444444444444";
const DPR = "77777777-7777-4777-8777-777777777777";

const prelude = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select case
    when coalesce(current_setting('request.jwt.claims', true), '') = '' then '{}'::jsonb
    else current_setting('request.jwt.claims', true)::jsonb
  end
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
grant usage on schema auth to anon, authenticated;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select case
    when name is null or strpos(name, '/') = 0 then array[]::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end
$$;
grant usage on schema storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
`;

function claims(uid: string, aal: string) {
  return JSON.stringify({ sub: uid, aal, role: "authenticated" }).replaceAll("'", "''");
}

async function asUser<T>(db: PGlite, uid: string, aal: string, fn: () => Promise<T>) {
  await db.exec("begin");
  try {
    await db.exec(`select set_config('request.jwt.claims', '${claims(uid, aal)}', true)`);
    await db.exec("set local role authenticated");
    const value = await fn();
    await db.exec("commit");
    return value;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function expectError(db: PGlite, uid: string, aal: string, sql: string, pattern: RegExp) {
  await db.exec("begin");
  await db.exec(`select set_config('request.jwt.claims', '${claims(uid, aal)}', true)`);
  await db.exec("set local role authenticated");
  let failed = false;
  try {
    await db.exec(sql);
  } catch (error) {
    failed = true;
    assert.match(String(error), pattern);
  }
  await db.exec("rollback");
  assert.equal(failed, true);
}

test("RLS isolates citizens, agency queues, and the audit log", async () => {
  const db = new PGlite();
  await db.exec(prelude);
  for (const name of fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
  }

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${CITIZEN_A}', 'maria.cruz.demo@example.com', '{"full_name":"Maria Cruz"}'),
      ('${CITIZEN_B}', 'juan.dela.cruz.demo@example.com', '{"full_name":"Juan Dela Cruz"}'),
      ('${DPW}', 'daniel.reyes.demo@example.com', '{"full_name":"Daniel Reyes"}'),
      ('${GWA}', 'aileen.camacho.demo@example.com', '{"full_name":"Aileen Camacho"}'),
      ('${DLM}', 'paolo.duenas.demo@example.com', '{"full_name":"Paolo Duenas"}'),
      ('${DPR}', 'rita.cruz.demo@example.com', '{"full_name":"Rita Cruz"}');
    insert into public.memberships (user_id, agency_id, role)
    select '${DPW}', id, 'reviewer' from public.agencies where code = 'dpw';
    insert into public.memberships (user_id, agency_id, role)
    select '${GWA}', id, 'reviewer' from public.agencies where code = 'gwa';
    insert into public.memberships (user_id, agency_id, role)
    select '${DLM}', id, 'reviewer' from public.agencies where code = 'dlm';
    insert into public.memberships (user_id, agency_id, role)
    select '${DPR}', id, 'reviewer' from public.agencies where code = 'dpr';
  `);

  const typeId = (await db.query<{ id: string }>("select id from public.application_types limit 1")).rows[0].id;
  const inserted = await asUser(db, CITIZEN_A, "aal1", async () => {
    const result = await db.query<{ id: string }>(
      `insert into public.applications (applicant_id, application_type_id, status, lot)
       values ('${CITIZEN_A}', '${typeId}', 'draft', '12') returning id`,
    );
    return result.rows[0].id;
  });

  const own = await asUser(db, CITIZEN_A, "aal1", async () =>
    db.query("select lot from public.applications where id = $1", [inserted]),
  );
  assert.equal(own.rows.length, 1);

  const other = await asUser(db, CITIZEN_B, "aal1", async () =>
    db.query("select id from public.applications"),
  );
  assert.equal(other.rows.length, 0);

  await expectError(db, CITIZEN_A, "aal1",
    `update public.applications set status = 'issued' where id = '${inserted}'`,
    /permission denied|restricted_column/);

  const tamper = await asUser(db, CITIZEN_B, "aal1", async () =>
    db.query(`update public.applications set lot = 'stolen' where id = '${inserted}' returning id`),
  );
  assert.equal(tamper.rows.length, 0);
  const still = await db.query<{ lot: string }>("select lot from public.applications where id = $1", [inserted]);
  assert.equal(still.rows[0].lot, "12");

  await asUser(db, CITIZEN_A, "aal1", async () => {
    await db.exec(`
      insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size)
      values ('${inserted}', '${CITIZEN_A}', 'plans', '${inserted}/plans.pdf', 'plans.pdf', 'application/pdf', 1200)
    `);
  });
  const docsB = await asUser(db, CITIZEN_B, "aal1", async () => db.query("select id from public.documents"));
  assert.equal(docsB.rows.length, 0);

  await asUser(db, CITIZEN_A, "aal1", async () => {
    await db.exec(`
      insert into storage.objects (bucket_id, name)
      values ('application-documents', '${inserted}/plans.pdf')
    `);
  });
  await expectError(db, CITIZEN_B, "aal1",
    `insert into storage.objects (bucket_id, name) values ('application-documents', '${inserted}/other.pdf')`,
    /row-level security|permission denied|violates/);

  const gwaBefore = await asUser(db, GWA, "aal2", async () => db.query("select id from public.applications"));
  assert.equal(gwaBefore.rows.length, 0, "a draft is not in the GWA queue");

  await db.exec(`
    update public.applications set
      status = 'clearances_in_progress', tract = '4', block = '2', zoning_district = 'R1 example',
      ownership = 'owner', scope = 'New private one-family dwelling', sewage = 'public_sewer',
      water_supply = 'public', contractor_license = 'CLB-DEMO-100', attestation = true,
      attestation_name = 'Maria Cruz'
    where id = '${inserted}';
    insert into public.application_steps (application_id, workflow_step_id, agency_id, status)
    select '${inserted}', w.id, w.agency_id,
      case w.code
        when 'dpw_intake' then 'approved'
        when 'gwa_availability' then 'queued'
        when 'dlm_zoning' then 'not_started'
        else 'not_started'
      end
    from public.workflow_steps w;
    insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size)
    values ('${inserted}', '${CITIZEN_A}', 'plot_plan', '${inserted}/plot.pdf', 'plot.pdf', 'application/pdf', 800);
    select private.write_audit('${inserted}'::uuid, 'note', 'application', '${inserted}'::uuid, 'citizen event', null, null, 'citizen');
    select private.write_audit('${inserted}'::uuid, 'note', 'application', '${inserted}'::uuid, 'staff only', null, null, 'staff');
  `);

  const gwa = await asUser(db, GWA, "aal2", async () => db.query("select id from public.applications"));
  assert.equal(gwa.rows.length, 1);
  const gwaWeak = await asUser(db, GWA, "aal1", async () => db.query("select id from public.applications"));
  assert.equal(gwaWeak.rows.length, 0, "agency review requires MFA");
  const dlm = await asUser(db, DLM, "aal2", async () => db.query("select id from public.applications"));
  assert.equal(dlm.rows.length, 0, "an unrouted agency does not see the file");
  const dpr = await asUser(db, DPR, "aal2", async () => db.query("select id from public.applications"));
  assert.equal(dpr.rows.length, 0);
  const dpw = await asUser(db, DPW, "aal2", async () => db.query("select id from public.applications"));
  assert.equal(dpw.rows.length, 1, "DPW lead sees the submitted file");

  const gwaDocs = await asUser(db, GWA, "aal2", async () => db.query("select kind from public.documents order by kind"));
  assert.equal(gwaDocs.rows.length, 2);
  const dlmDocs = await asUser(db, DLM, "aal2", async () => db.query("select id from public.documents"));
  assert.equal(dlmDocs.rows.length, 0);
  const gwaFiles = await asUser(db, GWA, "aal2", async () =>
    db.query("select name from storage.objects where bucket_id = 'application-documents'"),
  );
  assert.equal(gwaFiles.rows.length, 1);
  const dlmFiles = await asUser(db, DLM, "aal2", async () => db.query("select id from storage.objects"));
  assert.equal(dlmFiles.rows.length, 0);

  const citizenAudit = await asUser(db, CITIZEN_A, "aal1", async () =>
    db.query<{ visibility: string }>("select visibility from public.audit_log"),
  );
  assert.deepEqual(citizenAudit.rows.map((row) => row.visibility), ["citizen"]);
  const otherAudit = await asUser(db, CITIZEN_B, "aal1", async () => db.query("select id from public.audit_log"));
  assert.equal(otherAudit.rows.length, 0);

  await expectError(db, CITIZEN_A, "aal1",
    "insert into public.audit_log (action, entity, visibility) values ('forged', 'application', 'citizen')",
    /permission denied|append-only/);
  let auditBlocked = false;
  try {
    await db.exec("update public.audit_log set action = 'rewritten'");
  } catch (error) {
    auditBlocked = true;
    assert.match(String(error), /append-only/);
  }
  assert.equal(auditBlocked, true);
  auditBlocked = false;
  try {
    await db.exec("delete from public.audit_log");
  } catch (error) {
    auditBlocked = true;
    assert.match(String(error), /append-only/);
  }
  assert.equal(auditBlocked, true);

  const anonFailed = await db.exec("begin");
  await db.exec("set local role anon");
  let anonBlocked = false;
  try {
    await db.query("select id from public.applications");
  } catch (error) {
    anonBlocked = true;
    assert.match(String(error), /permission denied/);
  }
  await db.exec("rollback");
  assert.equal(anonBlocked, true);
  void anonFailed;

  await expectError(db, CITIZEN_A, "aal1", `select public.submit_application('${inserted}')`, /not_ready|illegal/);

  await asUser(db, CITIZEN_A, "aal1", async () => {
    await db.exec(`
      update public.applications set
        lot = '12', tract = '4', block = '2', zoning_district = 'R1 example', ownership = 'owner',
        scope = 'New private one-family dwelling', sewage = 'public_sewer', water_supply = 'public',
        contractor_license = 'CLB-DEMO-100', attestation = true, attestation_name = 'Maria Cruz'
      where id = '${inserted}'
    `);
  });
  // The visibility fixture moved the file out of draft. Use a second application for submit.
  const draft = await asUser(db, CITIZEN_A, "aal1", async () => {
    const created = await db.query<{ id: string }>(
      `insert into public.applications (applicant_id, application_type_id, status, lot, tract, block, zoning_district, ownership, scope, sewage, water_supply, contractor_license, attestation, attestation_name)
       values ('${CITIZEN_A}', '${typeId}', 'draft', '12', '4', '2', 'R1 example', 'owner', 'New private one-family dwelling', 'public_sewer', 'public', 'CLB-DEMO-100', true, 'Maria Cruz')
       returning id`,
    );
    const id = created.rows[0].id;
    await db.exec(`
      insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size) values
        ('${id}', '${CITIZEN_A}', 'plans', '${id}/plans.pdf', 'plans.pdf', 'application/pdf', 10),
        ('${id}', '${CITIZEN_A}', 'plot_plan', '${id}/plot.pdf', 'plot.pdf', 'application/pdf', 10)
    `);
    await db.exec(`select public.submit_application('${id}')`);
    return id;
  });
  const submitted = await db.query<{ status: string }>("select status from public.applications where id = $1", [draft]);
  assert.equal(submitted.rows[0].status, "submitted");
  const intake = await db.query<{ status: string }>(
    `select s.status from public.application_steps s
     join public.workflow_steps w on w.id = s.workflow_step_id
     where s.application_id = $1 and w.code = 'dpw_intake'`,
    [draft],
  );
  assert.equal(intake.rows[0].status, "queued");

  const intakeStep = (await db.query<{ id: string }>(
    `select s.id from public.application_steps s
     join public.workflow_steps w on w.id = s.workflow_step_id
     where s.application_id = $1 and w.code = 'dpw_intake'`,
    [draft],
  )).rows[0].id;

  await expectError(db, GWA, "aal2",
    `select public.review_step('${intakeStep}', 'in_progress', null)`,
    /wrong_agency/);
  await expectError(db, DPW, "aal1",
    `select public.review_step('${intakeStep}', 'in_progress', null)`,
    /mfa_required/);
  await expectError(db, DPW, "aal2",
    `select public.review_step('${intakeStep}', 'approved', 'skip')`,
    /illegal_step_transition/);
  await asUser(db, DPW, "aal2", async () => {
    await db.exec(`select public.review_step('${intakeStep}', 'in_progress', null)`);
  });
  const started = await db.query<{ status: string }>("select status from public.applications where id = $1", [draft]);
  assert.equal(started.rows[0].status, "intake");
});
