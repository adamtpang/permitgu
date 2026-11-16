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
  permitName?: string;
  agencyName?: string;
};

export const ACTIVE_STEP = ["queued", "in_progress", "info_requested"];

// Whole days since the step last moved.
export function waitingDays(updatedAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(updatedAt).getTime()) / 86_400_000));
}

export function waitingLabel(days: number) {
  if (days === 0) return "Moved today";
  return days === 1 ? "Waiting 1 day" : `Waiting ${days} days`;
}

// What is open at each agency: how many steps, and how long the oldest has sat.
// Steps waiting on the applicant are counted apart, because the agency cannot move them.
export function backlog(items: QueueItem[], now = Date.now()) {
  const byAgency = new Map<string, { agency: string; open: number; onApplicant: number; oldestDays: number }>();
  for (const item of items) {
    if (!ACTIVE_STEP.includes(item.status)) continue;
    const row = byAgency.get(item.agencyCode) ?? { agency: item.agencyCode, open: 0, onApplicant: 0, oldestDays: 0 };
    if (item.status === "info_requested") row.onApplicant += 1;
    else {
      row.open += 1;
      row.oldestDays = Math.max(row.oldestDays, waitingDays(item.updatedAt, now));
    }
    byAgency.set(item.agencyCode, row);
  }
  return [...byAgency.values()].sort((a, b) => b.open - a.open || b.oldestDays - a.oldestDays || a.agency.localeCompare(b.agency));
}

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
    // "open" is everything still moving. "all" and an empty filter show finished steps too.
    if (filter.status === "open" && !ACTIVE_STEP.includes(item.status)) return false;
    if (filter.status && filter.status !== "open" && filter.status !== "all" && item.status !== filter.status) return false;
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
