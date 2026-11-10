import assert from "node:assert/strict";
import test from "node:test";
import { citizenDestination, planAuthCallback } from "./auth-callback";
import { staffAccessDecision } from "./access";

test("the callback exchanges a PKCE code and keeps a same-origin next path", () => {
  const plan = planAuthCallback(new URL("https://permitgu.example/auth/callback?code=abc123&next=/applications/file-1"));
  assert.deepEqual(plan, { kind: "code", code: "abc123", next: "/applications/file-1" });
});

test("the callback uses the saved next path when the email link has only a code", () => {
  const plan = planAuthCallback(new URL("https://permitgu.example/auth/callback?code=from-email"), "/apply");
  assert.deepEqual(plan, { kind: "code", code: "from-email", next: "/apply" });
});

test("the callback verifies a token_hash link from the default email flow", () => {
  const plan = planAuthCallback(new URL("https://permitgu.example/auth/callback?token_hash=hash_1&type=magiclink"));
  assert.deepEqual(plan, { kind: "otp", tokenHash: "hash_1", type: "magiclink", next: "/applications" });
});

test("the callback shows Supabase error params instead of signing in", () => {
  const plan = planAuthCallback(new URL("https://permitgu.example/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"));
  assert.equal(plan.kind, "error");
  if (plan.kind === "error") assert.equal(plan.message, "Email link is invalid or has expired");
});

test("the callback rejects open redirects and staff destinations", () => {
  assert.equal(citizenDestination("https://evil.example"), "/applications");
  assert.equal(citizenDestination("//evil.example"), "/applications");
  assert.equal(citizenDestination("/\\evil.example"), "/applications");
  assert.equal(citizenDestination("/%2F%2Fevil.example"), "/applications");
  assert.equal(citizenDestination("/review"), "/applications");
  assert.equal(citizenDestination("/admin/audit"), "/applications");
  const plan = planAuthCallback(new URL("https://permitgu.example/auth/callback?code=abc&next=https://evil.example/phish"));
  assert.equal(plan.kind, "code");
  if (plan.kind === "code") assert.equal(plan.next, "/applications");
});

test("a magic link is aal1 and does not open the staff queue", () => {
  assert.equal(staffAccessDecision({ pathname: "/review", configured: true, signedIn: true, aal: "aal1" }), "redirect-mfa");
  assert.equal(staffAccessDecision({ pathname: "/admin", configured: true, signedIn: true, aal: "aal1" }), "redirect-mfa");
  assert.equal(citizenDestination("/review/abc"), "/applications");
});
