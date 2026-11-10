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

export function timelineLabel(action: string) {
  return action.replaceAll("_", " ");
}
