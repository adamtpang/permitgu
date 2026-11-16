import Link from "next/link";
import { StaffSignIn } from "@/components/auth-forms";
import { SetupNotice } from "@/components/shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Staff sign-in" };

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const query = await searchParams;
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="display pt-10">Staff sign-in</h1>
      <p className="text-lg text-ink2">Your password, then a code from your authenticator app.</p>
      {query.password === "set" ? (
        <p className="rounded-2xl border border-good px-4 py-3 text-good" role="status">
          Password saved. Sign in with it below.
        </p>
      ) : null}
      {isSupabaseConfigured() ? <StaffSignIn /> : <SetupNotice />}
      <ul className="grid gap-2 text-[0.95rem] text-ink2">
        <li>
          Forgot your password, or never set one? <Link href="/sign-in?next=/staff/set-password">Sign in with an email link</Link>, then set a new one.
          You will need a code from your authenticator app.
        </li>
        <li>Lost the authenticator app too? Ask a super admin. Nobody can reset it from this page.</li>
        <li>Applying for a permit? <Link href="/sign-in">Use the email link sign-in</Link>.</li>
        <li>This is not a Government of Guam login.</li>
      </ul>
    </div>
  );
}
