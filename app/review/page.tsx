import Link from "next/link";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { filterQueue, type QueueItem } from "@/lib/queue";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Staff queue" };

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
    .select("id, status, assignee_id, updated_at, agencies(code, acronym), workflow_steps(name), applications(id, lot, status, permit_number, application_types(code), profiles!applications_applicant_id_fkey(full_name))")
    .neq("status", "not_started");
  if (!current.isSuper) request = request.in("agency_id", current.agencyIds.length ? current.agencyIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await request;
  const items: QueueItem[] = (data ?? []).map((step) => {
    const application = one(step.applications);
    return {
      id: step.id,
      applicationId: application?.id ?? "",
      status: step.status,
      agencyCode: one(step.agencies)?.code ?? "",
      permitType: one(application?.application_types)?.code ?? "",
      assigneeId: step.assignee_id,
      assigneeName: null,
      updatedAt: step.updated_at,
      lot: application?.lot ?? "",
      applicant: one(application?.profiles)?.full_name ?? "",
      permitNumber: application?.permit_number ?? null,
      stepName: one(step.workflow_steps)?.name ?? "",
    };
  });
  const visible = filterQueue(items, {
    status: query.status,
    agency: query.agency,
    permitType: query.type,
    assignee: query.assignee,
    olderThanDays: query.age ? Number(query.age) : undefined,
    q: query.q,
  });
  const agencies = [...new Set(items.map((item) => item.agencyCode).filter(Boolean))].sort();

  return (
    <div className="grid gap-8">
      <h1 className="font-serif text-5xl font-normal">Queue</h1>
      <p className="max-w-2xl text-ink2">
        Your agency's backlog. DPW also sees every submitted residential file. Search, filter, then open a file to assign it, ask for more information, or approve or deny with a reason.
      </p>
      <form className="grid gap-3 rounded-3xl border border-line p-4 sm:grid-cols-3" method="get">
        <label className="grid gap-1 text-sm">Status
          <select name="status" defaultValue={query.status ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">Active and finished</option>
            {["queued", "in_progress", "info_requested", "approved", "rejected"].map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Agency
          <select name="agency" defaultValue={query.agency ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">All of yours</option>
            {agencies.map((code) => <option key={code}>{code}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Permit type
          <input name="type" defaultValue={query.type ?? ""} placeholder="building_permit_residential_one_family" className="rounded-2xl border border-line bg-paper px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">Assignee
          <select name="assignee" defaultValue={query.assignee ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            <option value={current.user.id}>Assigned to me</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Older than days
          <input name="age" inputMode="numeric" defaultValue={query.age ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">Search
          <input name="q" defaultValue={query.q ?? ""} placeholder="Lot, name, or permit number" className="rounded-2xl border border-line bg-paper px-3 py-2" />
        </label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper sm:col-span-3" type="submit">Filter</button>
      </form>
      <ul className="grid gap-3">
        {visible.map((item) => (
          <li key={item.id} className="rounded-3xl border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link className="font-medium no-underline" href={`/review/${item.applicationId}`}>
                {item.agencyCode.toUpperCase()} · {item.stepName}
              </Link>
              <StatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              Lot {item.lot || "—"} · {item.applicant || "Applicant"} · {item.permitType}
              {item.assigneeId ? "" : " · unassigned"}
            </p>
          </li>
        ))}
      </ul>
      {visible.length ? null : <p className="text-ink2">Nothing matches this filter.</p>}
    </div>
  );
}
