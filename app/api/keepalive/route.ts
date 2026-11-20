import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free Supabase projects pause after about a week with no database activity.
// A Vercel cron calls this once a day (vercel.json) and reads one public row,
// which counts as activity. It reads only the public permit list, nothing private.
export async function GET() {
  const env = supabaseEnv();
  if (!env) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const supabase = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
  const { error } = await supabase.from("application_types").select("code").limit(1);
  return Response.json(
    { ok: !error, at: new Date().toISOString() },
    { status: error ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
