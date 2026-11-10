import { isStaffPath } from "@/lib/access";

export const NEXT_COOKIE = "pg_next";
export const CITIZEN_HOME = "/applications";

const OTP_TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
export type EmailLinkType = (typeof OTP_TYPES)[number];

export type CallbackPlan =
  | { kind: "code"; code: string; next: string }
  | { kind: "otp"; tokenHash: string; type: EmailLinkType; next: string }
  | { kind: "error"; message: string }
  | { kind: "missing"; message: string };

export function citizenDestination(value: string | null | undefined) {
  const path = safePath(value);
  if (!path || isStaffPath(path)) return CITIZEN_HOME;
  return path;
}

export function safePath(value: string | null | undefined) {
  if (!value) return null;
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) return null;
  if (decoded.includes("://") || decoded.includes("\\")) return null;
  return decoded;
}

export function planAuthCallback(url: URL, cookieNext?: string | null): CallbackPlan {
  const next = citizenDestination(url.searchParams.get("next") ?? cookieNext ?? null);
  const error = url.searchParams.get("error");
  const errorCode = url.searchParams.get("error_code");
  const errorDescription = url.searchParams.get("error_description");
  if (error || errorCode || errorDescription) {
    return { kind: "error", message: callbackErrorMessage(errorDescription, errorCode, error) };
  }
  const code = url.searchParams.get("code");
  if (code) return { kind: "code", code, next };
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && type && isEmailLinkType(type)) return { kind: "otp", tokenHash, type, next };
  if (tokenHash || type) return { kind: "error", message: "That sign-in link is not one this site can use. Request a new email." };
  return { kind: "missing", message: "That sign-in link did not include a code. Request a new email." };
}

export function callbackErrorMessage(description: string | null, code: string | null, error: string | null) {
  const raw = description || code || error || "The sign-in link was rejected.";
  const text = raw.replace(/\+/g, " ").replace(/[\u0000-\u001f]/g, "").trim();
  return text.slice(0, 240) || "The sign-in link was rejected.";
}

export function isEmailLinkType(value: string): value is EmailLinkType {
  return (OTP_TYPES as readonly string[]).includes(value);
}

export function nextCookie(path: string, secure: boolean) {
  const value = encodeURIComponent(citizenDestination(path));
  return `${NEXT_COOKIE}=${value}; Path=/; Max-Age=3600; SameSite=Lax${secure ? "; Secure" : ""}`;
}
