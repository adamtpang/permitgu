import Link from "next/link";
import { SetPasswordForm } from "@/components/set-password-form";
import { SetupNotice } from "@/components/shell";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Set a staff password" };

export default async function SetPasswordPage() {
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  const signedIn = "user" in current && current.user;
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="font-serif text-5xl font-normal tracking-tight">Set a staff password</h1>
      <p className="text-ink2">
        Staff sign-in needs a password and an authenticator app. An account that was opened with an email link has no
        password yet. Set one here, then sign in as staff. This is not a Government of Guam login.
      </p>
      {!signedIn ? (
        <p>
          First <Link href="/sign-in">sign in with your email link</Link>, then come back to this page.
        </p>
      ) : !("staff" in current) || current.staff.length === 0 ? (
        <p>
          You are signed in as {current.user?.email}, and this account has no staff role. An admin has to grant one
          before a staff password is any use.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink2">Signed in as {current.user?.email}.</p>
          <SetPasswordForm />
        </>
      )}
    </div>
  );
}
