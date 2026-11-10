export type AuditRow = {
  id: string;
  action: string;
  actorRole: string | null;
  visibility: string;
  memo: string | null;
  applicationId: string | null;
  ip: string | null;
  createdAt: string;
};

export function filterAudit(
  rows: AuditRow[],
  filter: { action?: string; role?: string; visibility?: string; q?: string },
) {
  const needle = filter.q?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (filter.action && row.action !== filter.action) return false;
    if (filter.role && row.actorRole !== filter.role) return false;
    if (filter.visibility && row.visibility !== filter.visibility) return false;
    if (!needle) return true;
    return [row.action, row.memo ?? "", row.ip ?? "", row.applicationId ?? ""].join(" ").toLowerCase().includes(needle);
  });
}
