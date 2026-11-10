import Link from "next/link";
import { CitizenSignIn } from "@/components/auth-forms";
import { SetupNotice } from "@/components/shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/applications";
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="font-serif text-5xl font-normal tracking-tight">Sign in</h1>
      <p className="text-ink2">
        Citizens get an email code. No password. This is not a Government of Guam account. Staff use the{" "}
        <Link href="/staff/sign-in">staff sign-in</Link>, which requires an authenticator app.
      </p>
      {isSupabaseConfigured() ? <CitizenSignIn nextPath={nextPath} /> : <SetupNotice />}
    </div>
  );
}
