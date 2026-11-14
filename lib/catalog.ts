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
  source: string;
  unverified: boolean;
  trackable: boolean;
};

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
    .map((cell) => cell.trim());
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
    if (/^\d+$/.test(column[0])) {
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
      acronym: acronym.replace(/\*\*/g, "") || code,
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
    const trackable = /application for permit and plan review/i.test(name);
    rows.push({
      code,
      name,
      groupName: group,
      agencyLabel: (column[1] ?? "").replace(/\*\*/g, "").trim(),
      agencyCode: matchAgencyCode(column[1] ?? "", agencies),
      source: source.replace(/\*\*/g, "").trim(),
      unverified: groupUnverified || /unverified/i.test(source),
      trackable,
    });
  }
  return rows;
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

export function groupPermits(permits: CatalogPermit[]) {
  const groups = new Map<string, CatalogPermit[]>();
  for (const permit of permits) {
    const list = groups.get(permit.groupName) ?? [];
    list.push(permit);
    groups.set(permit.groupName, list);
  }
  return [...groups.entries()].map(([groupName, items]) => ({ groupName, items }));
}

export function documentKindAllowed(kind: string, documents: { code: string }[]) {
  return kind === "other" || documents.some((document) => document.code === kind);
}

export function sqlLiteral(value: string | null) {
  if (value == null) return "null";
  return `'${value.replaceAll("'", "''")}'`;
}
