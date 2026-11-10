import Link from "next/link";
import { SetupNotice } from "@/components/shell";
import { filterAudit, type AuditRow } from "@/lib/audit-view";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; role?: string; visibility?: string; q?: string }>;
}) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (current.aal !== "aal2" || !current.isSuper) return <p>The full audit log is for a super admin who has finished authenticator verification.</p>;
  const { data } = await current.supabase
    .from("audit_log")
    .select("id, action, actor_role, visibility, memo, application_id, ip, created_at")
    .order("id", { ascending: false })
    .limit(400);
  const rows: AuditRow[] = (data ?? []).map((row) => ({
    id: String(row.id),
    action: row.action,
    actorRole: row.actor_role,
    visibility: row.visibility,
    memo: row.memo,
    applicationId: row.application_id,
    ip: row.ip,
    createdAt: row.created_at,
  }));
  const visible = filterAudit(rows, query);
  const actions = [...new Set(rows.map((row) => row.action))].sort();
  return (
    <div className="grid gap-6">
      <h1 className="font-serif text-5xl font-normal">Audit log</h1>
      <p className="max-w-2xl text-ink2">
        Append-only. Sign-ins, file views, uploads, downloads, status changes, assignments, comments, and catalog edits. The database rejects updates and deletes.
      </p>
      <p><Link href="/admin/export">Download CSV</Link> · <Link href="/admin">Admin</Link></p>
      <form className="grid gap-3 sm:grid-cols-4" method="get">
        <label className="grid gap-1 text-sm">Action
          <select name="action" defaultValue={query.action ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">Any</option>
            {actions.map((action) => <option key={action}>{action}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Role
          <select name="role" defaultValue={query.role ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">Any</option>
            {["citizen", "reviewer", "agency_admin", "super_admin", "system"].map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Visibility
          <select name="visibility" defaultValue={query.visibility ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2">
            <option value="">Any</option>
            <option>citizen</option>
            <option>staff</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Search
          <input name="q" defaultValue={query.q ?? ""} className="rounded-2xl border border-line bg-paper px-3 py-2" />
        </label>
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-paper sm:col-span-4" type="submit">Filter</button>
      </form>
      <ul className="grid gap-2 text-sm">
        {visible.map((row) => (
          <li key={row.id} className="rounded-2xl border border-line px-4 py-3">
            <span className="font-medium">{row.action}</span>
            <span className="text-muted"> · {row.actorRole ?? "unknown"} · {row.visibility} · {new Date(row.createdAt).toLocaleString()}</span>
            {row.ip ? <span className="text-muted"> · {row.ip}</span> : null}
            {row.memo ? <p className="mt-1 text-ink2">{row.memo}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
