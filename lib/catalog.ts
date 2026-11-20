import { AGENCIES, STEPS } from "./template";
export type DirectoryAgency = {
  code: string;
  name: string;
  acronym: string;
  website: string | null;
  groupName: string;
  notes: string | null;
};

export type CatalogPermit = {
  code: string;
  name: string;
  groupName: string;
  agencyLabel: string;
  agencyCode: string | null;
  // Every agency the label names, lead first. A permit can touch several.
  agencyCodes: string[];
  source: string;
  unverified: boolean;
  trackable: boolean;
  // Where its tracker starts, when it has one that is switched on.
  trackerPath?: string;
};

// The start page for a tracked permit, from its type code.
export function trackerPath(typeCode: string | null | undefined) {
  if (!typeCode) return undefined;
  if (typeCode === "building_permit_residential_one_family") return "/apply";
  if (typeCode === "business_license_new") return "/apply/business-license";
  return `/apply/${typeCode}`;
}

export type RequiredDocument = {
  applicationTypeCode: string;
  code: string;
  name: string;
  required: boolean;
  notes: string | null;
};

const ALIASES: Record<string, string> = {
  dpw: "dpw",
  dlm: "dlm",
  gepa: "gepa",
  "guam epa": "gepa",
  gwa: "gwa",
  gpa: "gpa",
  gfd: "gfd",
  dphss: "dphss",
  clb: "clb",
  peals: "peals",
  dpr: "dpr",
  doag: "doag",
  agr: "doag",
  usace: "usace",
  ghpo: "ghpo",
  "historic preservation": "ghpo",
  tog: "tog",
  drt: "drt",
};

export function agencyCode(acronym: string, name: string) {
  const cleaned = acronym.replace(/\([^)]*\)/g, "").split(/[/|]/)[0]?.trim() ?? "";
  const basis = cleaned && cleaned !== "—" && cleaned !== "-" ? cleaned : name;
  const code = basis
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
  return (code || "agency").slice(0, 32);
}

export function permitCode(name: string) {
  const code = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return code.slice(0, 80) || "permit";
}

function cells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    // A dash inside a phrase becomes a colon. A lone dash still means "none".
    .map((cell) => cell.trim().replace(/\s+—\s+/g, ": "));
}

function isDivider(line: string) {
  return /^\|?\s*:?-{3,}/.test(line.trim());
}

function websiteOf(value: string) {
  const match = value.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

export function parseAgencies(markdown: string): DirectoryAgency[] {
  const lines = markdown.split(/\r?\n/);
  let group = "Directory";
  const rows: DirectoryAgency[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      group = heading[1].replace(/\s+/g, " ").trim();
      continue;
    }
    if (!line.trim().startsWith("|") || isDivider(line)) continue;
    // Only the lettered directory sections list agencies. The tables that explain
    // the "~51 agencies" figure and the recommended totals are counts, not agencies.
    if (!/^[A-Z]\.\s/.test(group)) continue;
    const column = cells(line);
    if (column.length < 3) continue;
    const header = column[0].toLowerCase();
    if (header === "#" || header === "name" || header === "item") continue;
    let name = "";
    let acronym = "";
    let site = "";
    let notes = "";
    if (/^\d+(?:[–-]\d+)?$/.test(column[0])) {
      name = column[1] ?? "";
      acronym = column[2] ?? "";
      site = column[3] ?? "";
    } else if (column[0] && column[1] && !column[0].startsWith("-")) {
      name = column[0];
      acronym = column[1];
      site = column[2] ?? "";
      notes = column[3] ?? "";
    }
    if (!name || name === "Name") continue;
    const code = agencyCode(acronym, name);
    if (seen.has(code)) continue;
    seen.add(code);
    rows.push({
      code,
      name: name.replace(/\*\*/g, ""),
      // An agency with no acronym is shown by its name.
      acronym: acronym.replace(/\*\*/g, "").replace(/^[—-]$/, "") || name.replace(/\*\*/g, "").replace(/\s*\([^)]*\)/g, ""),
      website: websiteOf(site),
      groupName: group,
      notes: notes.replace(/\*\*/g, "").trim() || null,
    });
  }
  return rows;
}

export function matchAgencyCode(label: string, agencies: DirectoryAgency[]) {
  const lower = label.toLowerCase();
  for (const [needle, code] of Object.entries(ALIASES)) {
    if (lower.includes(needle)) return code;
  }
  const hit = agencies.find((agency) => lower.includes(agency.acronym.toLowerCase().split("/")[0].trim()));
  if (hit) return hit.code;
  // Fall back to the agency's full name, for labels that never use the acronym.
  const named = agencies.find((agency) => agency.name.length > 8 && lower.includes(agency.name.toLowerCase()));
  return named?.code ?? null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Every agency a label names, in the order the label names them. Acronyms must
// match as whole words, so "GPA" does not match inside another word.
export function matchAgencyCodes(label: string, agencies: DirectoryAgency[]) {
  const lower = label.toLowerCase();
  const hits: { code: string; at: number }[] = [];
  const add = (code: string, at: number) => {
    if (at < 0) return;
    const prior = hits.find((hit) => hit.code === code);
    if (prior) prior.at = Math.min(prior.at, at);
    else hits.push({ code, at });
  };
  for (const [needle, code] of Object.entries(ALIASES)) {
    add(code, lower.search(new RegExp(`\\b${escapeRegExp(needle)}\\b`)));
  }
  for (const agency of agencies) {
    const acronym = agency.acronym.toLowerCase().split("/")[0].trim();
    if (acronym.length >= 3 && /[a-z]/.test(acronym)) {
      add(agency.code, lower.search(new RegExp(`\\b${escapeRegExp(acronym)}\\b`)));
    }
    if (agency.name.length > 8) add(agency.code, lower.indexOf(agency.name.toLowerCase()));
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.code);
}

export function parsePermits(markdown: string, agencies: DirectoryAgency[] = []): CatalogPermit[] {
  const lines = markdown.split(/\r?\n/);
  let group = "Catalog";
  let groupUnverified = false;
  const rows: CatalogPermit[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading) {
      group = heading[1].replace(/\s+/g, " ").trim();
      groupUnverified = false;
      continue;
    }
    if (/^\*\*Unverified/i.test(line.trim())) groupUnverified = true;
    if (!line.trim().startsWith("|") || isDivider(line)) continue;
    const column = cells(line);
    if (column.length < 3) continue;
    if (column[0].toLowerCase() === "item") continue;
    const name = column[0].replace(/\*\*/g, "").trim();
    if (!name) continue;
    let code = permitCode(name);
    if (seen.has(code)) code = `${code}-${rows.length}`;
    seen.add(code);
    const source = column[2] ?? "";
    const house = /application for permit and plan review/i.test(name);
    const trackable = house || code === "new-business-license-form-bl-01";
    const label = column[1] ?? "";
    const agencyCodes = house ? workflowAgencyCodes() : (formAgencies(code)?.codes ?? agencyCodesFor(label, agencies));
    // The lead is the first agency the label names, matched as a whole word, so
    // "Government Ethics Commission" is not read as the Governor (GOV).
    const lead = house ? "dpw" : (agencyCodesFor(label, agencies)[0] ?? matchAgencyCode(label, agencies));
    rows.push({
      code,
      name,
      groupName: group,
      agencyLabel: (column[1] ?? "").replace(/\*\*/g, "").trim(),
      agencyCode: lead,
      // The tracked permit touches every agency on its workflow, not only the one in its label.
      agencyCodes,
      source: source.replace(/\*\*/g, "").trim(),
      unverified: groupUnverified || /unverified/i.test(source),
      trackable,
    });
  }
  return rows;
}

// Agencies a permit touches beyond the one in its label, read from the application
// paper for that permit.
const BL01 = {
  codes: ["drt", "dlm", "dpw", "gfd", "dphss", "clb", "gpd", "gvb", "dpr", "gdoe"],
  note: "These are the clearance boxes printed on Form BL-01. Revenue and Taxation ticks the ones that apply to each application. BL-01 also lists the Board of Cosmetology. No public list says which business types trigger which box.",
  source: "https://www.guamtax.com/notices/FORMBL-01NEWBUSINESSLICENSEAPPLICATION.pdf",
};
const FORM_AGENCIES: { match: (code: string) => boolean; codes: string[]; note: string; source: string }[] = [
  { match: (code) => code === "new-business-license-form-bl-01" || code.startsWith("agency-clearances-on-bl-01"), ...BL01 },
];

export function formAgencies(permitCode: string) {
  return FORM_AGENCIES.find((entry) => entry.match(permitCode)) ?? null;
}

function workflowAgencyCodes() {
  const codes: string[] = [];
  for (const step of [...STEPS].sort((x, y) => x.sort - y.sort)) {
    if (!codes.includes(step.agency)) codes.push(step.agency);
  }
  return codes;
}

// Agencies in the order the label names them.
function agencyCodesFor(label: string, agencies: DirectoryAgency[]) {
  const all = matchAgencyCodes(label, agencies);
  if (all.length) return all;
  const lead = matchAgencyCode(label, agencies);
  return lead ? [lead] : [];
}

export const RESIDENTIAL_REQUIRED_DOCUMENTS: RequiredDocument[] = [
  {
    applicationTypeCode: "building_permit_residential_one_family",
    code: "plans",
    name: "Building plans",
    required: true,
    notes: "The DPW application asks for plans. The building official may waive them for minor work. This flow is a new house.",
  },
  {
    applicationTypeCode: "building_permit_residential_one_family",
    code: "plot_plan",
    name: "Plot plan",
    required: true,
    notes: "Drawn from a boundary survey, as the building guide describes.",
  },
];

export type AgencyRef = { code: string; acronym: string; name: string };

// One lookup for every agency code, from the directory and the workflow template.
export function agencyDirectory(agencies: { code: string; acronym: string; name: string }[]) {
  const map = new Map<string, AgencyRef>();
  for (const agency of AGENCIES) map.set(agency.code, { code: agency.code, acronym: agency.acronym, name: agency.name });
  for (const agency of agencies) {
    if (!map.has(agency.code)) map.set(agency.code, { code: agency.code, acronym: agency.acronym.split("/")[0].trim(), name: agency.name });
  }
  return map;
}

// The reverse of the catalog: for each agency, every permit that touches it.
export function permitsByAgency(permits: CatalogPermit[], directory: Map<string, AgencyRef>) {
  const rows = new Map<string, { agency: AgencyRef; lead: CatalogPermit[]; also: CatalogPermit[] }>();
  for (const permit of permits) {
    permit.agencyCodes.forEach((code, index) => {
      const agency = directory.get(code) ?? { code, acronym: code.toUpperCase(), name: code };
      const row = rows.get(code) ?? { agency, lead: [], also: [] };
      (index === 0 ? row.lead : row.also).push(permit);
      rows.set(code, row);
    });
  }
  return [...rows.values()].sort((a, b) => b.lead.length + b.also.length - (a.lead.length + a.also.length) || a.agency.name.localeCompare(b.agency.name));
}

export function groupPermits(permits: CatalogPermit[]) {
  const groups = new Map<string, CatalogPermit[]>();
  for (const permit of permits) {
    const list = groups.get(permit.groupName) ?? [];
    list.push(permit);
    groups.set(permit.groupName, list);
  }
  // Groups are numbered in the catalog ("12. Housing"). The database returns rows in
  // no fixed order, so sort by that number.
  const rank = (name: string) => Number.parseInt(name, 10) || Number.MAX_SAFE_INTEGER;
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([groupName, items]) => ({ groupName, items }));
}

export function documentKindAllowed(kind: string, documents: { code: string }[]) {
  return kind === "other" || documents.some((document) => document.code === kind);
}

export function sqlLiteral(value: string | null) {
  if (value == null) return "null";
  return `'${value.replaceAll("'", "''")}'`;
}
