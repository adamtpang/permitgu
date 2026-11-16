// Permits a super admin defined in the admin page, with no code change.
// The house permit (lib/template.ts) and the business license (lib/license.ts)
// keep their own purpose-built pages. Everything else is read from the database here.

import type { OverviewStep } from "@/components/steps-overview";

export type TypeField = {
  key: string;
  label: string;
  kind: "text" | "long" | "choice";
  required: boolean;
  help: string | null;
  choices: string[];
};

export type BuiltType = {
  id: string;
  code: string;
  name: string;
  summary: string;
  noun: string;
  active: boolean;
  builder: boolean;
  source: string | null;
  fields: TypeField[];
  lead: { code: string; name: string; acronym: string };
  steps: OverviewStep[];
  documents: { code: string; name: string; notes: string | null }[];
};

export const NOUNS = ["permit", "license", "certificate", "clearance", "registration", "approval"] as const;
export const FIELD_KINDS = [
  { value: "text", label: "Short answer" },
  { value: "long", label: "Long answer" },
  { value: "choice", label: "Pick one from a list" },
] as const;
export const STEP_ROUTINGS = [
  { value: "always", label: "Every file" },
  { value: "default_routed", label: "Every file, assumed (not confirmed)" },
  { value: "as_indicated", label: "Only when a reviewer adds it" },
] as const;

export function parseFields(raw: unknown): TypeField[] {
  if (!Array.isArray(raw)) return [];
  const fields: TypeField[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    if (typeof source.key !== "string" || typeof source.label !== "string") continue;
    const kind = source.kind === "long" || source.kind === "choice" ? source.kind : "text";
    fields.push({
      key: source.key,
      label: source.label,
      kind,
      required: source.required === true,
      help: typeof source.help === "string" && source.help ? source.help : null,
      choices: Array.isArray(source.choices) ? source.choices.filter((choice): choice is string => typeof choice === "string") : [],
    });
  }
  return fields;
}

export function builtAnswers(fields: TypeField[], details: unknown) {
  const source = (details ?? {}) as Record<string, unknown>;
  return fields.map((field) => ({ field, value: typeof source[field.key] === "string" ? (source[field.key] as string) : "" }));
}

// The line a built permit's file is known by: its first answer, or the permit's name.
export function builtTitle(type: Pick<BuiltType, "name" | "fields">, details: unknown) {
  const first = builtAnswers(type.fields, details).find((answer) => answer.value.trim());
  return first ? first.value.trim().slice(0, 80) : type.name;
}

export function validateBuilt(fields: TypeField[], values: Record<string, string>, attestation: { checked: boolean; name: string }, mode: "save" | "submit") {
  for (const field of fields) {
    const value = (values[field.key] ?? "").trim();
    if (value.length > (field.kind === "long" ? 1000 : 200)) return `"${field.label}" is too long.`;
    if (field.kind === "choice" && value && !field.choices.includes(value)) return `Pick one of the listed answers for "${field.label}".`;
    if (mode === "submit" && field.required && !value) return `Answer "${field.label}".`;
  }
  if (attestation.name.length > 200) return "The attestation name is too long.";
  if (mode === "submit" && (!attestation.checked || !attestation.name.trim())) return "Check the attestation and enter the name for it.";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reader = { from: (table: string) => any };

const one = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);

const TYPE_COLUMNS = "id, code, name, summary, noun, active, builder, source, fields, agencies(code, name, acronym)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(row: any): Omit<BuiltType, "steps" | "documents"> {
  const lead = one<{ code: string; name: string; acronym: string }>(row.agencies);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    summary: row.summary ?? "",
    noun: row.noun ?? "permit",
    active: row.active !== false,
    builder: row.builder === true,
    source: row.source ?? null,
    fields: parseFields(row.fields),
    lead: lead ?? { code: "", name: "the lead agency", acronym: "" },
  };
}

// The columns a list page embeds to name a file without loading the whole permit.
export const TYPE_EMBED = "application_types(code, name, noun, builder, fields, agencies(name))";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function builtInfo(embedded: any) {
  const row = one<Record<string, unknown>>(embedded);
  if (!row || row.builder !== true) return null;
  return {
    builder: true,
    name: String(row.name ?? "Permit"),
    noun: String(row.noun ?? "permit"),
    lead: { name: one<{ name: string }>(row.agencies as { name: string } | { name: string }[] | null)?.name ?? "the lead agency" },
    fields: parseFields(row.fields),
    documents: [] as { code: string; name: string }[],
  };
}

// One permit with its steps and papers. `by` is the type's code or its id.
export async function loadType(supabase: Reader, by: { code: string } | { id: string }): Promise<BuiltType | null> {
  const query = supabase.from("application_types").select(TYPE_COLUMNS);
  const { data: row } = await ("code" in by ? query.eq("code", by.code) : query.eq("id", by.id)).maybeSingle();
  if (!row) return null;
  const base = shape(row);
  const { data: steps } = await supabase.from("workflow_steps").select("code, name, phase, routing, sort_order, uncertainty, agencies(code)").eq("application_type_id", base.id).order("sort_order");
  const { data: documents } = await supabase.from("required_documents").select("code, name, notes").eq("application_type_id", base.id).order("name");
  return {
    ...base,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    steps: (steps ?? []).map((step: any) => ({
      code: step.code,
      name: step.name,
      agency: one<{ code: string }>(step.agencies)?.code ?? "",
      phase: step.phase,
      routing: step.routing,
      uncertainty: step.uncertainty ?? null,
    })),
    documents: documents ?? [],
  };
}

// Every permit built in the admin page. Citizens see only the ones switched on.
export async function listBuiltTypes(supabase: Reader, options: { activeOnly: boolean }) {
  let query = supabase.from("application_types").select(TYPE_COLUMNS).eq("builder", true);
  if (options.activeOnly) query = query.eq("active", true);
  const { data } = await query.order("name");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(shape);
}

// What a built permit is missing before it can be switched on.
export function readiness(type: BuiltType) {
  const missing: string[] = [];
  if (!type.fields.length) missing.push("at least one question for the applicant");
  if (!type.steps.some((step) => step.phase === "clearance")) missing.push("at least one review step");
  if (!type.source) missing.push("an official source link");
  return missing;
}
