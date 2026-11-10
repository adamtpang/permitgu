import { NextResponse } from "next/server";
import { recordAuthEvent } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  await recordAuthEvent("sign_out");
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
