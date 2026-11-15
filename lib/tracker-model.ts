export type TrackerStep = {
  id: string;
  name: string;
  agency: string;
  agencyName: string;
  status: string;
  routing: string;
  sort: number;
  uncertainty: string | null;
  memo: string | null;
};

const ACTIVE = ["in_progress", "info_requested", "queued"];

export function currentStep(steps: TrackerStep[]) {
  const ordered = [...steps].sort((a, b) => a.sort - b.sort);
  for (const status of ACTIVE) {
    const hit = ordered.find((step) => step.status === status);
    if (hit) return hit;
  }
  return null;
}

export function agencyRollup(steps: TrackerStep[]) {
  const groups = new Map<string, { agency: string; agencyName: string; steps: TrackerStep[] }>();
  for (const step of [...steps].sort((a, b) => a.sort - b.sort)) {
    const group = groups.get(step.agency) ?? { agency: step.agency, agencyName: step.agencyName, steps: [] };
    group.steps.push(step);
    groups.set(step.agency, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    status: group.steps.some((step) => step.status === "rejected")
      ? "rejected"
      : group.steps.some((step) => step.status === "info_requested")
        ? "info_requested"
        : group.steps.some((step) => step.status === "in_progress" || step.status === "queued")
          ? "in_progress"
          : group.steps.every((step) => ["approved", "waived", "n_a", "not_started"].includes(step.status))
            ? group.steps.some((step) => step.status === "approved")
              ? "approved"
              : "not_started"
            : "in_progress",
  }));
}

export type TimelineEvent = {
  id: string;
  action: string;
  memo: string | null;
  createdAt: string;
  actorRole: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  draft_created: "Draft started",
  upload_document: "Paper uploaded",
  download_document: "Paper opened",
  submit: "Submitted",
  steps_queued: "Sent to agencies",
  review_step: "Step updated",
  route_step: "Step routed",
  advance: "Moved to the next stage",
  status: "Stage changed",
  request_info: "More information requested",
  respond_info: "Reply sent",
  assess_fees: "Fee entered",
  fees_paid_in_person: "Fee marked paid in person",
  issue: "Issued",
  permit_number: "Number assigned",
  comment: "Note added",
  assign_step: "Step assigned",
  withdraw: "Withdrawn",
  deny: "Denied",
  expire: "Marked expired",
  reopen_step: "Step reopened",
  view_application: "File opened",
};

export function timelineLabel(action: string) {
  return ACTION_LABELS[action] ?? action.charAt(0).toUpperCase() + action.slice(1).replaceAll("_", " ");
}

// Opening a file is logged every time, which is right for an audit and noise in a
// history. The history shows what changed, with the opens counted in one line.
export function splitTimeline(events: TimelineEvent[]) {
  const views = events.filter((event) => event.action === "view_application");
  return {
    changes: events.filter((event) => event.action !== "view_application"),
    views: views.length,
    lastView: views.length ? views.map((event) => event.createdAt).sort().at(-1) ?? null : null,
  };
}

// What to say at the top of a file. A finished or closed file says so plainly.
export function fileHeadline(status: string, steps: TrackerStep[], noun: string) {
  const closed: Record<string, string> = {
    issued: `Your ${noun} was issued.`,
    occupancy_issued: "Your certificate of occupancy was issued.",
    denied: "This application was denied.",
    withdrawn: "This application was withdrawn.",
    expired: "This application expired.",
  };
  if (Object.hasOwn(closed, status)) return { kind: "closed" as const, text: closed[status] };
  if (status === "awaiting_applicant") return { kind: "waiting" as const, text: "An agency is waiting on your reply." };
  const step = currentStep(steps);
  if (step) return { kind: "step" as const, step };
  return { kind: "between" as const, text: "Between steps. The lead agency moves the file to its next stage." };
}
