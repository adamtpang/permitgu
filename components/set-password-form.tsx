"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export const MIN_STAFF_PASSWORD = 12;

// Sets a staff password on the account that is signed in right now. It covers two
// cases: an account opened by email link that has no password yet, and a staff member
// who forgot theirs. An account that already has an authenticator app has to prove it
// with a code before the password changes.
export function SetPasswordForm() {
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    (async () => {
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level.data?.currentLevel === "aal2") return;
      const factors = await supabase.auth.mfa.listFactors();
      const totp = factors.data?.totp?.find((factor) => factor.status === "verified");
      if (live && totp) setFactorId(totp.id);
    })();
    return () => {
      live = false;
    };
    // The client is created once per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supabase) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < MIN_STAFF_PASSWORD) return setError(`Use at least ${MIN_STAFF_PASSWORD} characters.`);
    if (password !== again) return setError("The two passwords do not match.");
    setBusy(true);
    if (factorId) {
      const challenge = await supabase!.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setBusy(false);
        return setError(challenge.error.message);
      }
      const verified = await supabase!.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
      if (verified.error) {
        setBusy(false);
        return setError("That authenticator code did not work. Enter the current six digits.");
      }
      setFactorId(null);
    }
    const { error: updateError } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    router.push("/staff/sign-in?password=set");
  }

  return (
    <form onSubmit={save} className="grid max-w-md gap-3">
      <Label htmlFor="new-password">New password</Label>
      <Input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_STAFF_PASSWORD} value={password} onChange={(event) => setPassword(event.target.value)} />
      <Label htmlFor="new-password-again">New password again</Label>
      <Input id="new-password-again" type="password" autoComplete="new-password" required minLength={MIN_STAFF_PASSWORD} value={again} onChange={(event) => setAgain(event.target.value)} />
      {factorId ? (
        <>
          <Label htmlFor="password-totp">Code from your authenticator app</Label>
          <Input id="password-totp" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.trim())} />
          <p className="text-sm text-muted">This account already has an authenticator app, so the password changes only with a code from it.</p>
        </>
      ) : null}
      <Button type="submit" disabled={busy}>{busy ? "Saving" : "Save password"}</Button>
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
    </form>
  );
}
