import { NextResponse } from "next/server";
import { NEXT_COOKIE, planAuthCallback } from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookie = readCookie(request.headers.get("cookie"), NEXT_COOKIE);
  const plan = planAuthCallback(url, cookie);
  if (plan.kind === "error" || plan.kind === "missing") return fail(url, plan.message);
  const supabase = await createClient();
  if (!supabase) return fail(url, "Sign-in is not configured on this preview yet.");

  const result = plan.kind === "code"
    ? await supabase.auth.exchangeCodeForSession(plan.code)
    : await supabase.auth.verifyOtp({ token_hash: plan.tokenHash, type: plan.type });
  if (result.error) return fail(url, result.error.message);

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  await supabase.rpc("record_event", {
    p_application_id: null,
    p_action: "sign_in",
    p_entity: "session",
    p_entity_id: null,
    p_memo: plan.kind === "code" ? "Email link" : "Email link token",
    p_ip: forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    p_user_agent: request.headers.get("user-agent"),
  });

  const response = NextResponse.redirect(new URL(plan.next, url.origin));
  response.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function fail(url: URL, message: string) {
  const target = new URL("/sign-in", url.origin);
  target.searchParams.set("error", message.slice(0, 240));
  const response = NextResponse.redirect(target);
  response.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  const parts = header.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}
