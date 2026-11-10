export const STAFF_PATHS = ["/review", "/admin"];

export type StaffDecision = "allow" | "redirect-signin" | "redirect-mfa";

export function isStaffPath(pathname: string) {
  if (pathname === "/staff/sign-in" || pathname.startsWith("/staff/sign-in/")) return false;
  return STAFF_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function staffAccessDecision(input: {
  pathname: string;
  configured: boolean;
  signedIn: boolean;
  aal: string | null;
}): StaffDecision {
  if (!input.configured || !isStaffPath(input.pathname)) return "allow";
  if (!input.signedIn) return "redirect-signin";
  if (input.aal !== "aal2") return "redirect-mfa";
  return "allow";
}
