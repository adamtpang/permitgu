// Writes the business license steps from lib/license.ts into its migration, so the
// database seed and the app share one definition. Usage: npx tsx tools/emit_license_steps.mjs
import fs from "node:fs";
import { LICENSE_STEPS } from "../lib/license.ts";

const file = "supabase/migrations/20261115020000_business_license.sql";
const quote = (value) => (value == null ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const rows = LICENSE_STEPS.map(
  (step) => `  (${quote(step.code)}, ${quote(step.name)}, ${quote(step.agency)}, ${quote(step.phase)}, ${quote(step.routing)}, ${step.sort}, ${quote(step.uncertainty)})`,
).join(",\n");

const sql = fs.readFileSync(file, "utf8");
const start = sql.indexOf("from (values\n") + "from (values\n".length;
const end = sql.indexOf("\n) as v(code, name, agency, phase, routing, sort_order, uncertainty)");
if (start < 13 || end < 0) throw new Error("step block not found");
fs.writeFileSync(file, sql.slice(0, start) + rows + sql.slice(end));
console.log(`steps ${LICENSE_STEPS.length}`);
