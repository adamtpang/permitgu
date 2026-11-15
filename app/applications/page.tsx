import Link from "next/link";
import { ActionCard, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { fileTitle, permitKind } from "@/lib/license";
import { one, session } from "@/lib/session";

export const metadata = { title: "Your files" };

export default async function ApplicationsPage() {
  const current = await session();
  if (!current.configured) return <SetupNotice />;
  if (!current.user) {
    return (
      <PageHero eyebrow="Unofficial tracker" title="Your files." lede="Sign in to see the drafts and applications you have started.">
        <Link className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="/sign-in?next=/applications">
          Sign in
        </Link>
      </PageHero>
    );
  }
  const { data } = await current.supabase
    .from("applications")
    .select("id, status, lot, tract, block, details, created_at, permit_number, application_types(code)")
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  return (
    <div>
      <PageHero
        eyebrow="Unofficial tracker"
        title="Your files."
        lede={rows.length ? "Open one to see where it is and what happens next." : "You have not started anything yet."}
      />

      {rows.length ? (
        <Section>
          <ul className="grid gap-4">
            {rows.map((row) => {
              const code = one(row.application_types)?.code;
              const kind = permitKind(code);
              return (
                <li key={row.id}>
                  <Link className="block rounded-[32px] border border-line p-6 text-ink no-underline transition hover:border-ink2" href={`/applications/${row.id}`}>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">{kind.typeName}</span>
                    <span className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-serif text-[clamp(1.7rem,3.6vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">{fileTitle(code, row)}</span>
                      <StatusBadge status={row.status} />
                    </span>
                    {row.permit_number ? <span className="mt-3 block text-[0.95rem] text-ink2">Demo number {row.permit_number}. {kind.numberNote}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="Start another">
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply" label="Public Works leads" title="Build a house">A one-family building permit.</ActionCard>
          <ActionCard href="/apply/business-license" label="Revenue and Taxation leads" title="Open a business">A new general business license.</ActionCard>
        </div>
      </Section>
    </div>
  );
}
