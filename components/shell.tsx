import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export function UnofficialBanner() {
  return (
    <div className="border-b border-warnline bg-warn px-4 py-2 text-center text-sm text-ink2">
      <strong className="text-ink">Unofficial demo.</strong> Not affiliated with the Government of Guam. Always confirm
      requirements with the agency before you apply.
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
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
      {/* The home page and guides are static files, not app routes, so they take a full page load. */}
      <a href="/" className="flex items-center gap-2 text-ink no-underline" aria-label="PermitGU home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="" width={36} height={36} />
        <span className="font-brand text-xl font-extrabold tracking-tight">
          Permit<span className="text-gu">GU</span>
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-ink2">
          Demo
        </span>
      </a>
      {/* On a phone the brand and the sign-in button share the first row, and the links scroll sideways on the second. */}
      <div className="order-2 sm:order-3">
        {email ? (
          <form action="/sign-out" method="post">
            <button className="inline-flex min-h-[44px] items-center rounded-full border border-line px-4 text-[0.95rem]" type="submit">Sign out</button>
          </form>
        ) : (
          <Link className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-4 text-[0.95rem] font-medium text-paper no-underline" href="/sign-in">Sign in</Link>
        )}
      </div>
      <nav className="order-3 -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-1 overflow-x-auto px-5 text-[0.95rem] sm:order-2 sm:mx-0 sm:ml-auto sm:w-auto sm:px-0" aria-label="Tracker">
        {[
          ["/apply", "Start a permit"],
          ["/applications", "Your files"],
          ["/permits", "Permits"],
          ["/agencies", "Agencies"],
          ["/review", "Staff"],
          ...(email ? [["/admin", "Admin"]] : []),
        ].map(([href, label]) => (
          <Link key={href} className="inline-flex min-h-[44px] flex-none items-center whitespace-nowrap rounded-full px-3 text-ink no-underline hover:bg-soft" href={href}>
            {label}
          </Link>
        ))}
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
