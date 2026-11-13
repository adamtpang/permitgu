import { formatDuration, type Eta } from "@/lib/eta";
import { PIPELINE, PIPELINE_LABEL } from "@/lib/template";
import { agencyRollup, currentStep, timelineLabel, type TimelineEvent, type TrackerStep } from "@/lib/tracker-model";
import { formatCents, type ApplicationStatus, type StepStatus } from "@/lib/workflow";

const STEP_LABEL: Record<StepStatus, string> = {
  not_started: "Not started",
  queued: "Queued",
  in_progress: "In review",
  info_requested: "Needs your reply",
  approved: "Approved",
  rejected: "Rejected",
  waived: "Waived",
  n_a: "N/A",
};

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "occupancy_issued" || status === "issued"
      ? "border-good text-good"
      : status === "rejected" || status === "denied"
        ? "border-bad text-bad"
        : status === "info_requested" || status === "awaiting_applicant" || status === "fees_due"
          ? "border-warnline bg-warn text-ink"
          : "border-line text-ink2";
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>{label(status)}</span>;
}

function label(status: string) {
  if (status in STEP_LABEL) return STEP_LABEL[status as StepStatus];
  if (status in PIPELINE_LABEL) return PIPELINE_LABEL[status as keyof typeof PIPELINE_LABEL];
  return status.replaceAll("_", " ");
}

export function PizzaTracker({ status }: { status: ApplicationStatus | string }) {
  const current = PIPELINE.indexOf(status as (typeof PIPELINE)[number]);
  const side = status === "awaiting_applicant" || status === "denied" || status === "withdrawn" || status === "expired";
  return (
    <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
      {PIPELINE.map((stage, index) => {
        const done = current > index;
        const now = current === index && !side;
        return (
          <li
            key={stage}
            aria-current={now ? "step" : undefined}
            className={`rounded-2xl border px-3 py-3 text-sm ${now ? "border-navy bg-soft" : "border-line"} ${done ? "text-good" : "text-ink2"}`}
          >
            <span className="block text-xs uppercase tracking-wide">{done ? "Done" : now ? "Now" : "Later"}</span>
            <span className="font-medium text-ink">{PIPELINE_LABEL[stage]}</span>
          </li>
        );
      })}
      {side ? (
        <li className="rounded-2xl border border-warnline bg-warn px-3 py-3 text-sm sm:col-span-3" aria-current="step">
          <span className="block text-xs uppercase tracking-wide">Now</span>
          <span className="font-medium text-ink">{label(status)}</span>
        </li>
      ) : null}
    </ol>
  );
}

export function EtaCallout({ eta }: { eta: Eta }) {
  if (eta.kind === "done") return null;
  return (
    <section className="rounded-3xl border border-line p-5" aria-label="Estimated time">
      <h2 className="font-serif text-3xl font-normal">Estimated time to permit</h2>
      {eta.kind === "estimate" ? (
        <>
          <p className="mt-2 text-lg text-ink">
            {eta.remainingSeconds === 0
              ? "Due any time now."
              : `${capitalize(formatDuration(eta.remainingSeconds))}, around ${eta.readyBy.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`}
          </p>
          <p className="mt-2 text-sm text-ink2">
            An estimate, not a promise. It is the usual time each remaining step took on this tracker, based on at
            least {eta.samples} finished files per step. It is not an official agency timeline, and it stops at permit
            issuance.
          </p>
        </>
      ) : eta.kind === "paused" ? (
        <p className="mt-2 text-ink2">
          {eta.reason === "applicant"
            ? "The clock is waiting on your reply. An estimate returns once the agency has what it asked for."
            : "No estimate while the file is not under review."}
        </p>
      ) : (
        <p className="mt-2 text-ink2">
          No estimate yet.{" "}
          {eta.needed
            ? `Only ${eta.known} of the ${eta.needed} remaining steps have enough finished files on this tracker to estimate from.`
            : "No agency is holding this file right now."}{" "}
          No agency has published timelines for these steps, so this tracker only estimates from its own history.
        </p>
      )}
    </section>
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function CurrentStepBanner({ steps }: { steps: TrackerStep[] }) {
  const step = currentStep(steps);
  return (
    <p className="rounded-2xl border border-navy bg-soft px-4 py-3" aria-live="polite">
      {step ? (
        <>
          <span className="text-xs uppercase tracking-wide text-muted">Current step</span>
          <span className="mt-1 block text-lg font-medium text-ink">{step.agency} · {step.name}</span>
          <span className="text-sm text-ink2">{label(step.status)}. {step.uncertainty ?? ""}</span>
        </>
      ) : (
        <span>No agency is holding this file right now.</span>
      )}
    </p>
  );
}

export function ClearanceBoard({ steps }: { steps: TrackerStep[] }) {
  const groups = agencyRollup(steps);
  return (
    <section className="grid gap-3">
      <h2 className="font-serif text-3xl font-normal">Agencies</h2>
      <ul className="grid gap-3">
        {groups.map((group) => (
          <li key={group.agency} className="rounded-2xl border border-line px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{group.agencyName}</span>
              <StatusBadge status={group.status} />
            </div>
            <ul className="mt-2 grid gap-1 text-sm text-ink2">
              {group.steps.map((step) => (
                <li key={step.id} className="flex flex-wrap justify-between gap-2">
                  <span>{step.name}</span>
                  <span>{label(step.status)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EventTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-serif text-3xl font-normal">Timeline</h2>
      <ol className="grid gap-2">
        {events.map((event) => (
          <li key={event.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
            <span className="font-medium">{timelineLabel(event.action)}</span>
            <span className="text-muted"> · {event.actorRole ?? "system"} · {new Date(event.createdAt).toLocaleString()}</span>
            {event.memo ? <p className="mt-1 text-ink2">{event.memo}</p> : null}
          </li>
        ))}
      </ol>
      {events.length ? null : <p className="text-sm text-muted">No events yet.</p>}
    </section>
  );
}

export function FeeCallout({ cents, paid }: { cents: number | null; paid: boolean }) {
  return (
    <div className="rounded-3xl border border-warnline bg-warn p-5 text-ink">
      <h2 className="font-serif text-3xl font-normal">Fees due</h2>
      {cents == null ? (
        <p className="mt-2 text-ink2">
          DPW has not entered a fee for this application. Do not treat any number on this site as an official fee.
          The dollar schedule is not confirmed.
        </p>
      ) : (
        <p className="mt-2 text-lg">{formatCents(cents)} {paid ? "marked paid in person." : "entered by staff for this file."}</p>
      )}
      <p className="mt-2 text-sm text-ink2">
        Pay in person at the Treasurer of Guam cashier at the Business License and Permit Center. Permit GU does not
        take a card, a transfer, or any online payment.
      </p>
    </div>
  );
}
