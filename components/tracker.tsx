import { PIPELINE, PIPELINE_LABEL } from "@/lib/template";
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
