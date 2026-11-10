import Link from "next/link";
import { StaffSignIn } from "@/components/auth-forms";
import { SetupNotice } from "@/components/shell";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Staff sign-in" };

export default function StaffSignInPage() {
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="font-serif text-5xl font-normal tracking-tight">Staff sign-in</h1>
      <p className="text-ink2">
        Password, then an authenticator app. The queue stays closed until the second factor succeeds. This is not a
        Government of Guam login. Citizens <Link href="/sign-in">use an email code</Link> instead.
      </p>
      {isSupabaseConfigured() ? <StaffSignIn /> : <SetupNotice />}
    </div>
  );
}
