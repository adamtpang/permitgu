import Link from "next/link";
import { CitizenSignIn } from "@/components/auth-forms";
import { SetupNotice } from "@/components/shell";
import { citizenDestination } from "@/lib/auth-callback";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const nextPath = citizenDestination(params.next);
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="font-serif text-5xl font-normal tracking-tight">Sign in</h1>
      <p className="text-ink2">
        Citizens get an email link. No password. This is not a Government of Guam account. Staff use the{" "}
        <Link href="/staff/sign-in">staff sign-in</Link>, which requires a password and an authenticator app. An email link does not open the staff queue.
      </p>
      {params.error ? <p className="text-sm text-bad" role="alert">{params.error}</p> : null}
      {isSupabaseConfigured() ? <CitizenSignIn nextPath={nextPath} /> : <SetupNotice />}
    </div>
  );
}
