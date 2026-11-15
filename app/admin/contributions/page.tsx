import Link from "next/link";
import { SetupNotice } from "@/components/shell";
import { Button } from "@/components/ui";
import { setContributionStatus } from "@/lib/actions";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Corrections inbox" };

const STATUSES = ["new", "reviewed", "used", "dismissed"] as const;

export default async function ContributionsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (current.aal !== "aal2" || !current.isSuper) return <p>The corrections inbox is for a super admin who has finished authenticator verification.</p>;

  const wanted = STATUSES.find((status) => status === query.status) ?? "new";
  const { data } = await current.supabase
    .from("contributions")
    .select("id, topic, detail, source_url, contact, status, created_at")
    .eq("status", wanted)
    .order("id", { ascending: false })
    .limit(200);
  const rows = data ?? [];

  return (
    <div className="grid gap-6">
      <h1 className="font-serif text-5xl font-normal">Corrections inbox</h1>
      <p className="max-w-2xl text-ink2">
        Sent from the &ldquo;Help fill this in&rdquo; form on the guide pages. Nothing here is verified. Check each one against an official source before changing a guide.
      </p>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        {STATUSES.map((status) => (
          <Link
            key={status}
            href={`/admin/contributions?status=${status}`}
            aria-current={status === wanted ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 no-underline ${status === wanted ? "border-navy bg-soft" : "border-line"}`}
          >
            {status}
          </Link>
        ))}
      </nav>
      {query.error ? <p className="text-sm text-bad" role="alert">{query.error}</p> : null}
      <ul className="grid gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{row.topic}</span>
              <span className="text-xs text-muted">{new Date(row.created_at).toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink2">{row.detail}</p>
            {/* The address is shown as text. It comes from a stranger, so it is not a link. */}
            <p className="mt-2 break-all text-sm">Source: {row.source_url ?? "none given"}</p>
            <p className="text-sm">Contact: {row.contact ?? "none given"}</p>
            <form action={setContributionStatus} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="from" value={wanted} />
              {STATUSES.filter((status) => status !== wanted).map((status) => (
                <Button key={status} type="submit" name="status" value={status} variant="outline">
                  Mark {status}
                </Button>
              ))}
            </form>
          </li>
        ))}
      </ul>
      {rows.length ? null : <p className="text-sm text-muted">Nothing marked {wanted}.</p>}
    </div>
  );
}
