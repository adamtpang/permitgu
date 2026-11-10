import Link from "next/link";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Staff queue" };

export default async function ReviewPage() {
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) {
    return <p><Link href="/staff/sign-in">Staff sign-in</Link> uses a password and an authenticator app.</p>;
  }
  if (!current.staff.length) return <p>This account has no staff role.</p>;
  if (current.aal !== "aal2") {
    return <p><Link href="/staff/sign-in">Finish authenticator verification</Link> before the queue opens.</p>;
  }

  let query = current.supabase.from("application_steps").select("id, status, agencies(acronym), workflow_steps(name), applications(id, lot, status, permit_number)").in("status", ["queued", "in_progress", "info_requested"]);
  if (!current.isSuper) query = query.in("agency_id", current.agencyIds.length ? current.agencyIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await query;

  let files: { id: string; lot: string | null; status: string; permit_number: string | null }[] = [];
  if (current.lead || current.isSuper) {
    const all = await current.supabase.from("applications").select("id, lot, status, permit_number").neq("status", "draft").order("updated_at", { ascending: false });
    files = all.data ?? [];
  }

  return (
    <div className="grid gap-8">
      <h1 className="font-serif text-5xl font-normal">Queue</h1>
      <p className="max-w-2xl text-ink2">You see steps for your agency. DPW also sees every submitted residential file, because DPW leads this permit. Other agencies do not.</p>
      <ul className="grid gap-3">
        {(data ?? []).map((step) => {
          const application = one(step.applications);
          return (
            <li key={step.id} className="rounded-3xl border border-line p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link className="font-medium no-underline" href={`/review/${application?.id}`}>
                  {one(step.agencies)?.acronym} · {one(step.workflow_steps)?.name}
                </Link>
                <StatusBadge status={step.status} />
              </div>
              <p className="mt-1 text-sm text-muted">Lot {application?.lot || "—"}</p>
            </li>
          );
        })}
      </ul>
      {(data ?? []).length ? null : <p className="text-ink2">Nothing is queued for you.</p>}
      {files.length ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-3xl font-normal">All open residential files</h2>
          <ul className="grid gap-2">
            {files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <Link href={`/review/${file.id}`}>Lot {file.lot || "—"}</Link>
                <StatusBadge status={file.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
