import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  agencyDirectory,
  documentKindAllowed,
  groupPermits,
  matchAgencyCodes,
  parseAgencies,
  parsePermits,
  permitsByAgency,
  RESIDENTIAL_REQUIRED_DOCUMENTS,
} from "./catalog";

const agenciesMd = fs.readFileSync("docs/sources/guam-agencies.md", "utf8");
const permitsMd = fs.readFileSync("docs/sources/guam-permits-catalog.md", "utf8");

test("the agency and permit catalogs come from the source lists", () => {
  const agencies = parseAgencies(agenciesMd);
  const permits = parsePermits(permitsMd, agencies);
  assert.ok(agencies.length >= 55, `agencies ${agencies.length}`);
  assert.ok(permits.length >= 90, `permits ${permits.length}`);
  assert.ok(agencies.some((agency) => agency.code === "dpw"));
  // The tables that explain the agency count are not agencies.
  assert.ok(agencies.every((agency) => /^[A-Z]\.\s/.test(agency.groupName)), "only lettered directory sections");
  assert.equal(agencies.some((agency) => agency.code === "count" || /^\d+$/.test(agency.code)), false);
  assert.equal(permits.find((permit) => permit.code === "cpa-accountancy")?.agencyCode, "gboa");
  const directory = agencyDirectory(agencies);
  // A permit can touch several agencies, in the order its label names them.
  assert.deepEqual(permits.find((permit) => permit.agencyLabel === "DPW + GEPA")?.agencyCodes, ["dpw", "gepa"]);
  assert.deepEqual(permits.find((permit) => permit.agencyLabel === "GLUC / DLM")?.agencyCodes, ["gluc", "dlm"]);
  assert.equal(permits.find((permit) => permit.trackable)?.agencyCodes.length, 14);
  const license = permits.find((permit) => permit.code === "new-business-license-form-bl-01");
  assert.deepEqual(license?.agencyCodes.slice(0, 3), ["drt", "dlm", "dpw"]);
  assert.ok(license!.agencyCodes.every((code) => directory.has(code)), "every BL-01 agency is in the directory");
  assert.ok(permits.every((permit) => !permit.agencyCode || permit.agencyCodes.includes(permit.agencyCode)));
  // Acronyms match as whole words only.
  assert.deepEqual(matchAgencyCodes("Agpar licensing", agencies), []);
  const byAgency = permitsByAgency(permits, directory);
  assert.ok(byAgency.find((row) => row.agency.code === "dlm")!.also.length >= 2);
  assert.ok(agencies.some((agency) => agency.code === "ghpo"));
  const building = permits.find((permit) => permit.trackable);
  assert.equal(building?.agencyCode, "dpw");
  const sections = groupPermits(permits);
  assert.ok(sections.some((section) => section.groupName.startsWith("1.")));
  assert.equal(documentKindAllowed("plans", RESIDENTIAL_REQUIRED_DOCUMENTS), true);
  assert.equal(documentKindAllowed("deed", RESIDENTIAL_REQUIRED_DOCUMENTS), false);
  const generated = JSON.parse(fs.readFileSync("lib/catalog.generated.json", "utf8"));
  assert.equal(generated.permits.length, permits.length);
  assert.equal(generated.agencies.length, agencies.length);
});
