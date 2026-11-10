import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { staffAccessDecision } from "@/lib/access";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const decision = staffAccessDecision({
    pathname: request.nextUrl.pathname,
    configured: true,
    signedIn: Boolean(data.user),
    aal: level.data?.currentLevel ?? null,
  });
  if (decision === "allow") return response;
  const next = request.nextUrl.clone();
  next.pathname = "/staff/sign-in";
  next.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(next);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico|css|js|html|txt|xml)$).*)"],
};
