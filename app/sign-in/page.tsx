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
      <h1 className="display pt-10">Sign in</h1>
      <p className="text-lg text-ink2">Enter your email and we send you a link. No password.</p>
      {params.error ? <p className="rounded-2xl border border-bad px-4 py-3 text-bad" role="alert">{params.error}</p> : null}
      {isSupabaseConfigured() ? <CitizenSignIn nextPath={nextPath} /> : <SetupNotice />}
      <ul className="grid gap-2 text-[0.95rem] text-ink2">
        <li>This is not a Government of Guam account.</li>
        <li>Agency staff use the <Link href="/staff/sign-in">staff sign-in</Link>. An email link does not open the staff queue.</li>
      </ul>
    </div>
  );
}
