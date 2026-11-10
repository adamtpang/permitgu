import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return new Response("Supabase is not configured.\n", { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return new Response("Sign in as staff.\n", { status: 401 });
  const { data, error } = await supabase.from("audit_log").select("id, created_at, application_id, actor_id, action, entity, entity_id, memo, visibility").order("id", { ascending: false }).limit(2000);
  if (error) return new Response(error.message, { status: 403 });
  const rows = data ?? [];
  const header = ["id", "created_at", "application_id", "actor_id", "action", "entity", "entity_id", "visibility", "memo"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key as keyof typeof row])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"permitgu-audit.csv\"",
      "cache-control": "no-store",
    },
  });
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
