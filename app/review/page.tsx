import Link from "next/link";
import { Bars, Fold, Glance, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { Button, Input, Label } from "@/components/ui";
import { ACTIVE_STEP, backlog, filterQueue, waitingDays, waitingLabel, type QueueItem } from "@/lib/queue";
import { fileTitle } from "@/lib/license";
import { builtInfo, TYPE_EMBED } from "@/lib/permit-types";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Staff queue" };

const STATUS_CHOICES = [
  { value: "open", label: "Still open" },
  { value: "queued", label: "Waiting to start" },
  { value: "in_progress", label: "In review" },
  { value: "info_requested", label: "Waiting on the applicant" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "Everything, finished too" },
];
const select = "w-full rounded-2xl border border-line bg-paper px-4 py-3";

// The line a file is known by in the queue, whatever kind of permit it is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function titled(application: any) {
  if (!application) return "";
  const code = one<{ code: string }>(application.application_types)?.code;
  return fileTitle(code, application, builtInfo(application.application_types));
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; agency?: string; type?: string; assignee?: string; age?: string; q?: string }>;
}) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) {
    return <p><Link href="/staff/sign-in">Staff sign-in</Link> uses a password and an authenticator app.</p>;
  }
  if (!current.staff.length) return <p>This account has no staff role.</p>;
  if (current.aal !== "aal2") {
    return <p><Link href="/staff/sign-in">Finish authenticator verification</Link> before the queue opens.</p>;
  }

  let request = current.supabase
    .from("application_steps")
    .select(`id, status, assignee_id, updated_at, agencies(code, acronym, name), workflow_steps(name), applications(id, lot, details, status, permit_number, is_test, is_sample, ${TYPE_EMBED}, profiles!applications_applicant_id_fkey(full_name))`)
    .neq("status", "not_started");
  if (!current.isSuper) request = request.in("agency_id", current.agencyIds.length ? current.agencyIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await request;
  const tests = new Set<string>();
  const samples = new Set<string>();
  const items: QueueItem[] = (data ?? []).map((step) => {
    const application = one(step.applications);
    const type = one<{ code: string; name: string }>(application?.application_types as { code: string; name: string } | { code: string; name: string }[] | null);
    if (application?.is_test) tests.add(step.id);
    if (application?.is_sample) samples.add(step.id);
    return {
      id: step.id,
      applicationId: application?.id ?? "",
      status: step.status,
      agencyCode: one(step.agencies)?.code ?? "",
      agencyName: one(step.agencies)?.name ?? "",
      permitType: type?.code ?? "",
      permitName: type?.name ?? "",
      assigneeId: step.assignee_id,
      assigneeName: null,
      updatedAt: step.updated_at,
      lot: titled(application),
      applicant: one(application?.profiles)?.full_name ?? "",
      permitNumber: application?.permit_number ?? null,
      stepName: one(step.workflow_steps)?.name ?? "",
    };
  });

  const filtered = Boolean(query.status || query.agency || query.type || query.assignee || query.age || query.q);
  const now = Date.now();
  const visible = filterQueue(items, {
    status: query.status ?? "open",
    agency: query.agency,
    permitType: query.type,
    assignee: query.assignee,
    olderThanDays: query.age ? Number(query.age) : undefined,
    q: query.q,
  }).sort((a, b) => {
    // Open work first, oldest at the top.
    const open = Number(ACTIVE_STEP.includes(b.status)) - Number(ACTIVE_STEP.includes(a.status));
    return open || new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const open = items.filter((item) => item.status === "queued" || item.status === "in_progress");
  const onApplicant = items.filter((item) => item.status === "info_requested");
  const mine = open.filter((item) => item.assigneeId === current.user!.id);
  const oldest = open.reduce((most, item) => Math.max(most, waitingDays(item.updatedAt, now)), 0);
  const agencies = new Map(items.map((item) => [item.agencyCode, item.agencyName || item.agencyCode.toUpperCase()]));
  const permits = new Map(items.map((item) => [item.permitType, item.permitName || item.permitType]));
  const load = backlog(items, now);

  return (
    <div>
      <PageHero
        eyebrow="Staff"
        title="Your queue."
        lede={open.length ? "The oldest open step is at the top." : "Nothing is waiting on your agency."}
      />

      <Section>
        <Glance
          facts={[
            { value: open.length, label: open.length === 1 ? "step waiting on staff" : "steps waiting on staff" },
            { value: mine.length, label: "assigned to you" },
            { value: onApplicant.length, label: "waiting on the applicant" },
            { value: oldest, label: oldest === 1 ? "day, the longest wait" : "days, the longest wait" },
          ]}
        />
      </Section>

      <Section title={filtered ? "Matching steps" : "Open steps"} lede={visible.length ? undefined : filtered ? "Nothing matches this filter." : "Finished steps are under the filter, with \"Everything\"."}>
        <ul className="grid gap-4">
          {visible.map((item) => {
            const active = ACTIVE_STEP.includes(item.status);
            return (
              <li key={item.id}>
                <Link className="block rounded-[32px] border border-line p-6 text-ink no-underline transition hover:border-ink2" href={`/review/${item.applicationId}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {item.agencyCode.toUpperCase()} · {item.permitName || item.permitType}
                    {samples.has(item.id) ? " · sample file" : tests.has(item.id) ? " · test file" : ""}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="font-serif text-[clamp(1.5rem,3.4vw,2rem)] leading-[1.1] tracking-[-0.02em]">{item.stepName}</span>
                    <StatusBadge status={item.status} />
                  </span>
                  <span className="mt-3 block text-[0.95rem] text-ink2">
                    {item.lot} · {item.applicant || "Applicant"}
                    {item.permitNumber ? ` · ${item.permitNumber}` : ""}
                  </span>
                  {active ? (
                    <span className="mt-1 block text-[0.95rem] text-ink2">
                      {waitingLabel(waitingDays(item.updatedAt, now))}
                      {item.assigneeId ? (item.assigneeId === current.user!.id ? " · assigned to you" : " · assigned") : " · not assigned"}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <Fold title="Filter" note={filtered ? "on" : undefined} open={filtered}>
            <form className="grid max-w-2xl gap-4" method="get">
              <div>
                <Label htmlFor="q">Search</Label>
                <Input id="q" name="q" defaultValue={query.q ?? ""} placeholder="Lot, name, or demo number" />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <select id="status" name="status" defaultValue={query.status ?? "open"} className={select}>
                  {STATUS_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="agency">Agency</Label>
                <select id="agency" name="agency" defaultValue={query.agency ?? ""} className={select}>
                  <option value="">All of yours</option>
                  {[...agencies].sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="type">Permit</Label>
                <select id="type" name="type" defaultValue={query.type ?? ""} className={select}>
                  <option value="">Any permit</option>
                  {[...permits].sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="assignee">Assigned to</Label>
                <select id="assignee" name="assignee" defaultValue={query.assignee ?? ""} className={select}>
                  <option value="">Anyone</option>
                  <option value="unassigned">No one yet</option>
                  <option value={current.user.id}>Me</option>
                </select>
              </div>
              <div>
                <Label htmlFor="age">Not touched for at least this many days</Label>
                <Input id="age" name="age" inputMode="numeric" defaultValue={query.age ?? ""} />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" className="min-h-[48px] px-6 text-base">Apply filter</Button>
                {filtered ? <Link href="/review" className="inline-flex min-h-[44px] items-center">Clear</Link> : null}
              </div>
            </form>
          </Fold>
        </div>
      </Section>

      {load.length ? (
        <Section title="Backlog by agency" lede="Open steps at each agency you can see. Steps waiting on the applicant are not counted against the agency.">
          <Bars
            rows={load.map((row) => ({
              label: agencies.get(row.agency) ?? row.agency.toUpperCase(),
              value: row.open,
              href: `/review?agency=${encodeURIComponent(row.agency)}&status=open`,
            }))}
          />
          <ul className="mt-6 grid gap-2 text-[0.95rem] text-ink2">
            {load.filter((row) => row.open > 0).map((row) => (
              <li key={row.agency}>
                {agencies.get(row.agency) ?? row.agency.toUpperCase()}: oldest open step has waited {row.oldestDays} {row.oldestDays === 1 ? "day" : "days"}
                {row.onApplicant ? `, plus ${row.onApplicant} waiting on the applicant` : ""}.
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[38rem] text-[0.95rem] text-muted">
            A wait is counted from the last time the step changed. Sample and test files are included here and marked in the list above.
          </p>
        </Section>
      ) : null}
    </div>
  );
}
