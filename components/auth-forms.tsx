"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordAuthEvent } from "@/lib/actions";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Button, Input, Label } from "@/components/ui";

export function CitizenSignIn({ nextPath }: { nextPath: string }) {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  if (!supabase) return null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const { error: authError } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`, shouldCreateUser: true },
    });
    if (authError) setError(authError.message);
    else setSent(true);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const { error: authError } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
    if (authError) setError(authError.message);
    else {
      await recordAuthEvent("sign_in");
      router.push(nextPath);
    }
  }

  return (
    <div className="grid max-w-md gap-6">
      <form onSubmit={send} className="grid gap-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <Button type="submit">Email me a code</Button>
      </form>
      {sent ? (
        <form onSubmit={verify} className="grid gap-3">
          <Label htmlFor="code">6-digit code</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.trim())} />
          <Button type="submit" variant="gu">Sign in</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

export function StaffSignIn() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"password" | "enroll" | "challenge">("password");
  const [error, setError] = useState("");
  const router = useRouter();
  if (!supabase) return null;

  async function afterPassword() {
    const { data, error: levelError } = await supabase!.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levelError) return setError(levelError.message);
    if (data.currentLevel === "aal2") return router.push("/review");
    const factors = await supabase!.auth.mfa.listFactors();
    if (factors.error) return setError(factors.error.message);
    const existing = factors.data.totp.find((factor) => factor.status === "verified");
    if (existing) {
      setFactorId(existing.id);
      setMode("challenge");
      return;
    }
    const enrolled = await supabase!.auth.mfa.enroll({ factorType: "totp", friendlyName: "PermitGU staff" });
    if (enrolled.error || !enrolled.data.totp) return setError(enrolled.error?.message ?? "Could not start authenticator enrollment.");
    setFactorId(enrolled.data.id);
    setSecret(enrolled.data.totp.secret);
    const image = enrolled.data.totp.qr_code;
    setQr(image.startsWith("data:") || image.startsWith("<") ? image : `data:image/svg+xml;utf-8,${encodeURIComponent(image)}`);
    setMode("enroll");
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const { error: authError } = await supabase!.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    else await afterPassword();
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const challenge = await supabase!.auth.mfa.challenge({ factorId });
    if (challenge.error) return setError(challenge.error.message);
    const verified = await supabase!.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (verified.error) return setError(verified.error.message);
    await recordAuthEvent("sign_in");
    router.push("/review");
  }

  const qrSrc = qr.startsWith("<") ? `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}` : qr;

  return (
    <div className="grid max-w-md gap-6">
      {mode === "password" ? (
        <form onSubmit={signIn} className="grid gap-3">
          <Label htmlFor="staff-email">Work email</Label>
          <Input id="staff-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <Label htmlFor="staff-password">Password</Label>
          <Input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button type="submit">Continue</Button>
        </form>
      ) : null}
      {mode === "enroll" ? (
        <form onSubmit={verify} className="grid gap-3">
          <p className="text-sm text-ink2">Scan this with an authenticator app, then enter the 6-digit code. Staff pages stay closed until this succeeds.</p>
          {qrSrc ? <img src={qrSrc} alt="Authenticator QR code" className="h-40 w-40 bg-white p-2" /> : null}
          <p className="break-all text-xs text-muted">Manual key: {secret}</p>
          <Label htmlFor="totp">Authenticator code</Label>
          <Input id="totp" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.trim())} />
          <Button type="submit" variant="gu">Enable and continue</Button>
        </form>
      ) : null}
      {mode === "challenge" ? (
        <form onSubmit={verify} className="grid gap-3">
          <Label htmlFor="totp-challenge">Authenticator code</Label>
          <Input id="totp-challenge" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(event) => setCode(event.target.value.trim())} />
          <Button type="submit" variant="gu">Verify</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : null}
    </div>
  );
}
