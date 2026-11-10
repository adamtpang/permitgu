import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export function UnofficialBanner() {
  return (
    <div className="border-b border-warnline bg-warn px-4 py-2 text-center text-sm text-ink2">
      <strong className="text-ink">Unofficial demo.</strong> Not a Government of Guam website. Not affiliated with any
      agency. No government seal. Confirm every requirement with the agency. Fees are paid in person.
    </div>
  );
}

export async function SiteHeader() {
  const supabase = await createClient();
  let email: string | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? null;
  }
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="flex items-center gap-2 text-ink no-underline" aria-label="PermitGU home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" width={36} height={36} />
        <span className="font-brand text-xl font-extrabold tracking-tight">
          Permit<span className="text-gu">GU</span>
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-ink2">
          Demo
        </span>
      </Link>
      <nav className="flex flex-wrap items-center justify-end gap-2 text-sm" aria-label="Tracker">
        <Link className="rounded-full px-3 py-2 no-underline hover:bg-soft" href="/apply">Apply</Link>
        <Link className="rounded-full px-3 py-2 no-underline hover:bg-soft" href="/applications">Your file</Link>
        <Link className="rounded-full px-3 py-2 no-underline hover:bg-soft" href="/review">Staff</Link>
        <Link className="rounded-full px-3 py-2 no-underline hover:bg-soft" href="/admin">Admin</Link>
        {email ? (
          <form action="/sign-out" method="post">
            <button className="rounded-full border border-line px-3 py-2" type="submit">Sign out</button>
          </form>
        ) : (
          <Link className="rounded-full bg-ink px-3 py-2 text-paper no-underline" href="/sign-in">Sign in</Link>
        )}
      </nav>
    </header>
  );
}

export function SetupNotice() {
  return (
    <AlertBlock>
      The tracker needs a Supabase project. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> on the preview, then redeploy. The guides on the home page still work
      without them. Nothing here is a Government of Guam login.
    </AlertBlock>
  );
}

function AlertBlock({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-warnline bg-warn px-4 py-3 text-sm text-ink2">{children}</div>;
}
