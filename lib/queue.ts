export type QueueItem = {
  id: string;
  applicationId: string;
  status: string;
  agencyCode: string;
  permitType: string;
  assigneeId: string | null;
  assigneeName: string | null;
  updatedAt: string;
  lot: string;
  applicant: string;
  permitNumber: string | null;
  stepName: string;
};

export type QueueFilter = {
  status?: string;
  agency?: string;
  permitType?: string;
  assignee?: string;
  olderThanDays?: number;
  q?: string;
  now?: string;
};

export function filterQueue(items: QueueItem[], filter: QueueFilter) {
  const needle = filter.q?.trim().toLowerCase() ?? "";
  const now = filter.now ? new Date(filter.now).getTime() : Date.now();
  return items.filter((item) => {
    if (filter.status && item.status !== filter.status) return false;
    if (filter.agency && item.agencyCode !== filter.agency) return false;
    if (filter.permitType && item.permitType !== filter.permitType) return false;
    if (filter.assignee === "unassigned" && item.assigneeId) return false;
    if (filter.assignee && filter.assignee !== "unassigned" && item.assigneeId !== filter.assignee) return false;
    if (filter.olderThanDays && filter.olderThanDays > 0) {
      const age = now - new Date(item.updatedAt).getTime();
      if (age < filter.olderThanDays * 24 * 60 * 60 * 1000) return false;
    }
    if (!needle) return true;
    const haystack = [item.lot, item.applicant, item.permitNumber ?? "", item.stepName, item.agencyCode].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
