import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { STEPS } from "../lib/template";

const sql = fs.readFileSync("supabase/migrations/20261109235731_permit_gu_mvp.sql", "utf8");

test("the migration seeds every residential workflow step", () => {
  for (const step of STEPS) {
    assert.ok(sql.includes(`'${step.code}'`), step.code);
    assert.ok(sql.includes(`'${step.routing}'`), `${step.code} routing`);
  }
  assert.equal(sql.includes("fees_due_cents bigint default"), false);
  assert.equal(sql.includes("audit_log is append-only"), true);
});
