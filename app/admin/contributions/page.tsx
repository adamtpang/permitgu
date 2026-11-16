import Link from "next/link";
import { ErrorNotice, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { Button } from "@/components/ui";
import { setContributionStatus } from "@/lib/actions";
import { guamStamp } from "@/lib/dates";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Corrections inbox" };

const STATUSES = ["new", "reviewed", "used", "dismissed"] as const;
const LABEL: Record<(typeof STATUSES)[number], string> = { new: "New", reviewed: "Looked at", used: "Used in a guide", dismissed: "Set aside" };
const MOVE: Record<(typeof STATUSES)[number], string> = { new: "Move back to new", reviewed: "Mark looked at", used: "Mark used in a guide", dismissed: "Set aside" };

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
  const counts = new Map<string, number>();
  for (const status of STATUSES) {
    const { count } = await current.supabase.from("contributions").select("id", { count: "exact", head: true }).eq("status", status);
    counts.set(status, count ?? 0);
  }

  return (
    <div>
      <PageHero
        eyebrow="Admin"
        title="Corrections."
        lede="What people sent from the guides. None of it is verified. Check each one against an official source before changing a guide."
      >
        <Link className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href="/admin">Back to admin</Link>
      </PageHero>
      <ErrorNotice text={query.error} />

      <Section>
        <nav className="flex flex-wrap gap-2" aria-label="Show corrections by status">
          {STATUSES.map((status) => (
            <Link
              key={status}
              href={`/admin/contributions?status=${status}`}
              aria-current={status === wanted ? "page" : undefined}
              className={`inline-flex min-h-[48px] items-center rounded-full border px-5 no-underline ${status === wanted ? "border-ink bg-ink text-paper" : "border-line text-ink"}`}
            >
              {LABEL[status]} · {counts.get(status)}
            </Link>
          ))}
        </nav>

        <ul className="mt-8 grid gap-4">
          {rows.map((row) => (
            <li key={row.id} className="rounded-[32px] border border-line p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-[clamp(1.5rem,3.4vw,2rem)] leading-tight tracking-[-0.02em]">{row.topic}</h2>
                <span className="text-[0.95rem] text-muted">{guamStamp(row.created_at)}</span>
              </div>
              <p className="mt-3 max-w-[38rem] whitespace-pre-wrap break-words text-ink2">{row.detail}</p>
              {/* The address is shown as text. It comes from a stranger, so it is not a link. */}
              <dl className="mt-4 grid gap-2 text-[0.95rem]">
                <div><dt className="inline text-muted">Source they gave: </dt><dd className="inline break-all">{row.source_url ?? "none"}</dd></div>
                <div><dt className="inline text-muted">How to reach them: </dt><dd className="inline break-all">{row.contact ?? "not given"}</dd></div>
              </dl>
              <form action={setContributionStatus} className="mt-5 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="from" value={wanted} />
                {STATUSES.filter((status) => status !== wanted).map((status) => (
                  <Button key={status} type="submit" name="status" value={status} variant="outline" className="min-h-[44px] px-5">
                    {MOVE[status]}
                  </Button>
                ))}
              </form>
            </li>
          ))}
        </ul>
        {rows.length ? null : <p className="mt-6 text-lg text-ink2">Nothing here.</p>}
      </Section>
    </div>
  );
}
