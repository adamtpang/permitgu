"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export const MIN_STAFF_PASSWORD = 12;

// A staff member who signed in by email link has no password yet, and staff
// sign-in needs one. This sets it on the account that is signed in right now.
export function SetPasswordForm() {
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  if (!supabase) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < MIN_STAFF_PASSWORD) return setError(`Use at least ${MIN_STAFF_PASSWORD} characters.`);
    if (password !== again) return setError("The two passwords do not match.");
    setBusy(true);
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
      <Button type="submit" disabled={busy}>{busy ? "Saving" : "Save password"}</Button>
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
    </form>
  );
}
