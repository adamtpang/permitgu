import Link from "next/link";
import { ActionCard, ErrorNotice, Fold, Notice, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { fileTitle, permitKind } from "@/lib/license";
import { noticeText } from "@/lib/notices";
import { builtInfo, listBuiltTypes, TYPE_EMBED } from "@/lib/permit-types";
import { one, session } from "@/lib/session";
import { timelineLabel } from "@/lib/tracker-model";

export const metadata = { title: "Your files" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
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
    .select(`id, status, lot, tract, block, details, created_at, permit_number, ${TYPE_EMBED}`)
    // Staff can read other people's files. This page is only the ones this person started.
    .eq("applicant_id", current.user.id)
    .order("created_at", { ascending: false });
  const all = data ?? [];
  // Files the applicant closed themselves sit below the ones still moving.
  const rows = all.filter((row) => row.status !== "withdrawn");
  const closed = all.filter((row) => row.status === "withdrawn");
  const more = await listBuiltTypes(current.supabase, { activeOnly: true });
  // What an agency did on each file since this person last opened it.
  const { data: updateRows } = await current.supabase.rpc("my_file_updates");
  const updates = new Map<string, { unread: number; last: string }>(
    ((updateRows ?? []) as { application_id: string; unread: number; last_action: string }[]).map((row) => [row.application_id, { unread: row.unread, last: row.last_action }]),
  );
  const fresh = rows.filter((row) => updates.has(row.id)).length;
  return (
    <div>
      <PageHero
        eyebrow="Unofficial tracker"
        title="Your files."
        lede={
          fresh
            ? `${fresh === 1 ? "One file has" : `${fresh} files have`} moved since you last looked.`
            : rows.length
              ? "Open one to see where it is and what happens next."
              : "You have not started anything yet."
        }
      />

      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={query.error} />

      {rows.length ? (
        <Section>
          <FileList rows={rows} updates={updates} />
        </Section>
      ) : null}

      {closed.length ? (
        <Section>
          <Fold title="Withdrawn or discarded" note={`${closed.length}`}>
            <FileList rows={closed} />
          </Fold>
        </Section>
      ) : null}

      <Section title="Start another">
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply" label="Public Works leads" title="Build a house">A one-family building permit.</ActionCard>
          <ActionCard href="/apply/business-license" label="Revenue and Taxation leads" title="Open a business">A new general business license.</ActionCard>
          {more.map((type) => (
            <ActionCard key={type.code} href={`/apply/${type.code}`} label={`${type.lead.name} leads`} title={type.name}>
              {type.summary || `Track this ${type.noun}.`}
            </ActionCard>
          ))}
        </div>
      </Section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FileList({ rows, updates }: { rows: any[]; updates?: Map<string, { unread: number; last: string }> }) {
  return (
    <ul className="grid gap-4">
      {rows.map((row) => {
              const code = one(row.application_types as { code: string } | { code: string }[] | null)?.code;
              const built = builtInfo(row.application_types);
              const kind = permitKind(code, built);
              return (
                <li key={row.id}>
                  <Link className="block rounded-[32px] border border-line p-6 text-ink no-underline transition hover:border-ink2" href={`/applications/${row.id}`}>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">{kind.typeName}</span>
                    <span className="mt-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="font-serif text-[clamp(1.7rem,3.6vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">{fileTitle(code, row, built)}</span>
                      <StatusBadge status={row.status} />
                    </span>
                    {updates?.has(row.id) ? (
                      <span className="mt-3 block text-[0.95rem] font-medium text-good">
                        New since you last looked: {timelineLabel(updates.get(row.id)!.last).toLowerCase()}
                        {updates.get(row.id)!.unread > 1 ? `, and ${updates.get(row.id)!.unread - 1} more` : ""}.
                      </span>
                    ) : null}
                    {row.permit_number ? <span className="mt-3 block text-[0.95rem] text-ink2">Demo number {row.permit_number}. {kind.numberNote}</span> : null}
                  </Link>
                </li>
              );
      })}
    </ul>
  );
}
