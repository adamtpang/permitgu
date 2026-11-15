import { rateLimited } from "../../../api/_rate.mjs";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITS = { topic: 160, detail: 3000, source: 2000, contact: 200 };

function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function field(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Takes one correction from the guide pages and stores it for a super admin to read.
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 16384) return reply({ error: "too_large" }, 413);
  let input: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.length > 16384) return reply({ error: "too_large" }, 413);
    input = JSON.parse(raw);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  // A hidden field people never see. Anything that fills it is a script.
  if (field(input.website, 200)) return reply({ ok: true }, 200);

  const topic = field(input.topic, LIMITS.topic);
  const detail = field(input.detail, LIMITS.detail);
  const source = field(input.source, LIMITS.source);
  const contact = field(input.contact, LIMITS.contact);
  if (!topic || !detail) return reply({ error: "empty" }, 400);
  if (source && !/^https?:\/\//i.test(source)) return reply({ error: "bad_source" }, 400);

  const supabase = await createClient();
  if (!supabase) return reply({ error: "not_configured" }, 503);

  const address = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  try {
    // A separate bucket from the question limit, so a correction never uses up someone's questions.
    if (await rateLimited(`contribute:${address}`)) return reply({ error: "rate_limited" }, 429);
  } catch {
    return reply({ error: "rate_limit_unavailable" }, 503);
  }

  const { error } = await supabase.rpc("submit_contribution", {
    p_topic: topic,
    p_detail: detail,
    p_source: source,
    p_contact: contact,
  });
  if (error) {
    const known = ["not_ready", "too_long", "bad_source", "inbox_full"].find((code) => error.message.includes(code));
    return reply({ error: known ?? "not_saved" }, known === "inbox_full" ? 503 : known ? 400 : 502);
  }
  return reply({ ok: true }, 201);
}
