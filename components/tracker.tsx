import { guamDate, guamDateTime } from "@/lib/dates";
import { formatDuration, type Eta } from "@/lib/eta";
import { PIPELINE, PIPELINE_LABEL } from "@/lib/template";
import { agencyRollup, fileHeadline, splitTimeline, timelineLabel, type TimelineEvent, type TrackerStep } from "@/lib/tracker-model";
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

// Each permit has its own stages. A business license has no plan review or inspections.
export function PizzaTracker({ status, pipeline = PIPELINE }: { status: ApplicationStatus | string; pipeline?: readonly string[] }) {
  const current = pipeline.indexOf(status);
  const side = status === "awaiting_applicant" || status === "denied" || status === "withdrawn" || status === "expired";
  return (
    <ol className={`grid gap-2 sm:grid-cols-3 ${pipeline.length > 6 ? "lg:grid-cols-9" : "lg:grid-cols-6"}`}>
      {pipeline.map((stage, index) => {
        const done = current > index;
        const now = current === index && !side;
        return (
          <li
            key={stage}
            aria-current={now ? "step" : undefined}
            className={`rounded-2xl border px-3 py-3 text-sm ${now ? "border-navy bg-soft" : "border-line"} ${done ? "text-good" : "text-ink2"}`}
          >
            <span className="block text-xs uppercase tracking-wide">{done ? "Done" : now ? "Now" : "Later"}</span>
            <span className="font-medium text-ink">{(PIPELINE_LABEL as Record<string, string>)[stage] ?? label(stage)}</span>
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

export function EtaCallout({ eta, noun = "permit", sample = false }: { eta: Eta; noun?: string; sample?: boolean }) {
  if (eta.kind === "done") return null;
  return (
    <section className="rounded-3xl border border-line p-5" aria-label="Estimated time">
      <h2 className="font-serif text-3xl font-normal">Estimated time to {noun}</h2>
      {eta.kind === "estimate" ? (
        <>
          {sample ? (
            <p className="mt-3 rounded-2xl border border-warnline bg-warn px-4 py-3 text-[0.95rem] text-ink">
              <strong>Sample data.</strong> This estimate is built from made-up sample files, so the demo has something to show. It is not a real agency time.
            </p>
          ) : null}
          <p className="mt-2 text-lg text-ink">
            {eta.remainingSeconds === 0
              ? "Due any time now."
              : `${capitalize(formatDuration(eta.remainingSeconds))}, around ${guamDate(eta.readyBy)}.`}
          </p>
          <p className="mt-2 text-sm text-ink2">
            An estimate, not a promise. It is the usual time each remaining step took on this tracker, based on at
            least {eta.samples} finished files per step. It is not an official agency timeline, and it stops when the {noun} is issued. Dates are Guam time.
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

export function CurrentStepBanner({ steps, status = "", noun = "permit" }: { steps: TrackerStep[]; status?: string; noun?: string }) {
  const headline = fileHeadline(status, steps, noun);
  return (
    <p className="rounded-[32px] border border-navy bg-soft px-6 py-5" aria-live="polite">
      {headline.kind === "step" ? (
        <>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Where it is now</span>
          <span className="mt-2 block font-serif text-[clamp(1.6rem,3.6vw,2.25rem)] leading-[1.08] tracking-[-0.025em] text-ink">{headline.step.name}</span>
          <span className="mt-2 block text-ink2">{headline.step.agencyName} · {label(headline.step.status)}</span>
        </>
      ) : (
        <span className="block font-serif text-[clamp(1.6rem,3.6vw,2.25rem)] leading-[1.08] tracking-[-0.025em] text-ink">{headline.text}</span>
      )}
    </p>
  );
}

export function ClearanceBoard({ steps, heading = true }: { steps: TrackerStep[]; heading?: boolean }) {
  const groups = agencyRollup(steps);
  return (
    <section className="grid gap-3">
      {heading ? <h2 className="font-serif text-3xl font-normal">Agencies</h2> : null}
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

// Pass opens when the page counts them separately, so they do not crowd changes out of the list.
export function EventTimeline({ events, heading = true, opens }: { events: TimelineEvent[]; heading?: boolean; opens?: { count: number; last: string | null } }) {
  const split = splitTimeline(events);
  const changes = split.changes;
  const views = opens ? opens.count : split.views;
  const lastView = opens ? opens.last : split.lastView;
  return (
    <section className="grid gap-3">
      {heading ? <h2 className="font-serif text-3xl font-normal">History</h2> : null}
      <ol className="grid gap-3">
        {changes.map((event) => (
          <li key={event.id} className="border-l-2 border-line pl-4">
            <span className="font-medium">{timelineLabel(event.action)}</span>
            <span className="block text-[0.95rem] text-muted">
              {guamDateTime(event.createdAt)} · {event.actorRole ?? "system"}
            </span>
            {event.memo ? <p className="mt-1 text-[0.95rem] text-ink2">{event.memo}</p> : null}
          </li>
        ))}
      </ol>
      {changes.length ? null : <p className="text-ink2">Nothing has changed yet.</p>}
      {views ? (
        <p className="text-[0.95rem] text-muted">
          Opened {views} {views === 1 ? "time" : "times"}{lastView ? `, last on ${guamDateTime(lastView)}` : ""}. Every open is kept in the audit log.
        </p>
      ) : null}
    </section>
  );
}

export function FeeCallout({ cents, paid, where, lead = "DPW" }: { cents: number | null; paid: boolean; where?: string; lead?: string }) {
  return (
    <div className="rounded-[32px] border border-warnline bg-warn p-6 text-ink">
      <h2 className="font-serif text-[clamp(1.6rem,3.6vw,2.25rem)] font-normal leading-[1.08]">{paid ? "Fee paid" : "Fee due"}</h2>
      {cents == null ? (
        <p className="mt-2 text-ink2">{lead} has not entered a fee yet. No number on this site is an official fee.</p>
      ) : (
        <p className="mt-2 font-serif text-[clamp(2.6rem,8vw,4.25rem)] leading-none tracking-[-0.035em]">{formatCents(cents)}</p>
      )}
      {cents == null ? null : <p className="mt-2 text-ink2">{paid ? "Marked paid in person by staff." : "Entered by staff for this file."}</p>}
      <p className="mt-3 text-[0.95rem] text-ink2">
        {where ?? "Pay in person at the Treasurer of Guam cashier at the Business License and Permit Center."} PermitGU does not take a card, a transfer, or any online payment.
      </p>
    </div>
  );
}
