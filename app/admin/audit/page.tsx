import Link from "next/link";
import { Fold, Glance, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { Button, Input, Label } from "@/components/ui";
import { filterAudit, type AuditRow } from "@/lib/audit-view";
import { guamStamp } from "@/lib/dates";
import { staffSession } from "@/lib/session";
import { timelineLabel } from "@/lib/tracker-model";

export const metadata = { title: "Audit log" };

const ROLE_LABEL: Record<string, string> = {
  citizen: "Applicant",
  reviewer: "Reviewer",
  agency_admin: "Agency admin",
  super_admin: "Super admin",
  system: "System",
};
const select = "w-full rounded-2xl border border-line bg-paper px-4 py-3";

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
  const { data, count } = await current.supabase
    .from("audit_log")
    .select("id, action, actor_role, visibility, memo, application_id, ip, created_at", { count: "exact" })
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
  const actions = [...new Set(rows.map((row) => row.action))].sort((a, b) => timelineLabel(a).localeCompare(timelineLabel(b)));
  const filtered = Boolean(query.action || query.role || query.visibility || query.q);
  const files = new Set(rows.map((row) => row.applicationId).filter(Boolean)).size;

  return (
    <div>
      <PageHero eyebrow="Admin" title="Every action." lede="Nothing in this log can be changed or deleted. The database refuses.">
        <Link className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="/admin/export">Download as CSV</Link>
        <Link className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href="/admin">Back to admin</Link>
      </PageHero>

      <Section>
        <Glance
          facts={[
            { value: count ?? rows.length, label: "entries in all" },
            { value: rows.length, label: "newest, loaded here" },
            { value: files, label: "files they touch" },
            { value: rows.filter((row) => row.visibility === "staff").length, label: "only staff can see" },
          ]}
        />
      </Section>

      <Section title={filtered ? "Matching entries" : "Newest first"} lede={visible.length ? undefined : "Nothing matches this filter."}>
        <Fold title="Filter" note={filtered ? "on" : undefined} open={filtered}>
          <form className="grid max-w-2xl gap-4" method="get">
            <div>
              <Label htmlFor="q">Search the notes</Label>
              <Input id="q" name="q" defaultValue={query.q ?? ""} />
            </div>
            <div>
              <Label htmlFor="action">What happened</Label>
              <select id="action" name="action" defaultValue={query.action ?? ""} className={select}>
                <option value="">Anything</option>
                {actions.map((action) => <option key={action} value={action}>{timelineLabel(action)}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="role">Who did it</Label>
              <select id="role" name="role" defaultValue={query.role ?? ""} className={select}>
                <option value="">Anyone</option>
                {Object.entries(ROLE_LABEL).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="visibility">Who can see it</Label>
              <select id="visibility" name="visibility" defaultValue={query.visibility ?? ""} className={select}>
                <option value="">Either</option>
                <option value="citizen">The applicant and staff</option>
                <option value="staff">Staff only</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" className="min-h-[48px] px-6 text-base">Apply filter</Button>
              {filtered ? <Link href="/admin/audit" className="inline-flex min-h-[44px] items-center">Clear</Link> : null}
            </div>
          </form>
        </Fold>

        <ol className="mt-8 grid gap-5">
          {visible.map((row) => (
            <li key={row.id} className="border-b border-line pb-5 last:border-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-lg font-medium">{timelineLabel(row.action)}</span>
                <span className="text-[0.95rem] text-muted">{guamStamp(row.createdAt)}</span>
              </div>
              <p className="text-[0.95rem] text-muted">
                {ROLE_LABEL[row.actorRole ?? ""] ?? "Unknown"} · {row.visibility === "staff" ? "staff only" : "applicant can see"}
                {row.ip ? ` · ${row.ip}` : ""}
              </p>
              {row.memo ? <p className="mt-1 max-w-[38rem] break-words text-[0.95rem] text-ink2">{row.memo}</p> : null}
              {row.applicationId ? (
                <p className="mt-1 text-[0.95rem]"><Link href={`/review/${row.applicationId}`}>Open the file</Link></p>
              ) : null}
            </li>
          ))}
        </ol>
        {rows.length < (count ?? 0) ? (
          <p className="mt-6 max-w-[38rem] text-[0.95rem] text-muted">Only the newest {rows.length} are loaded here. The CSV download holds the rest.</p>
        ) : null}
      </Section>
    </div>
  );
}
