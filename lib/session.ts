import "server-only";
import { createClient } from "@/lib/supabase/server";

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function session() {
  const supabase = await createClient();
  if (!supabase) return { configured: false as const };
  const { data, error } = await supabase.auth.getUser();
  if (error) return { configured: true as const, supabase, user: null, unreachable: true as const };
  return { configured: true as const, supabase, user: data.user, unreachable: false as const };
}

export async function staffSession() {
  const current = await session();
  if (!current.configured || !current.user) return current;
  const level = await current.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const { data } = await current.supabase.from("memberships").select("id, role, agency_id, agencies(code, acronym, name)");
  const memberships = data ?? [];
  const staff = memberships.filter((row) => row.role !== "citizen");
  return {
    ...current,
    aal: level.data?.currentLevel ?? "aal1",
    memberships,
    staff,
    agencyIds: staff.map((row) => row.agency_id).filter((id): id is string => Boolean(id)),
    isSuper: staff.some((row) => row.role === "super_admin"),
    lead: staff.some((row) => one(row.agencies)?.code === "dpw" && (row.role === "reviewer" || row.role === "agency_admin")),
  };
}
