import Link from "next/link";
import { notFound } from "next/navigation";
import { assessFees, denyApplication, expireApplication, issuePermit, markFeesPaid, requestInfo, reviewStep, routeStepAction } from "@/lib/actions";
import { SetupNotice } from "@/components/shell";
import { FeeCallout, PizzaTracker, StatusBadge } from "@/components/tracker";
import { Button, Input, Textarea } from "@/components/ui";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Review application" };

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (current.aal !== "aal2") return <p><Link href="/staff/sign-in">Verify your authenticator app</Link> to review.</p>;

  const { data: application } = await current.supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!application) notFound();
  const { data: steps } = await current.supabase.from("application_steps").select("id, status, memo, agency_id, agencies(code, acronym, name), workflow_steps(code, name, routing, sort_order, uncertainty)").eq("application_id", id);
  const ordered = [...(steps ?? [])].sort((a, b) => (one(a.workflow_steps)?.sort_order ?? 0) - (one(b.workflow_steps)?.sort_order ?? 0));
  const back = `/review/${id}`;

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm text-muted"><Link href="/review">Queue</Link></p>
        <h1 className="mt-2 font-serif text-5xl font-normal">Lot {application.lot || "—"}</h1>
        <div className="mt-3"><StatusBadge status={application.status} /></div>
        <p className="mt-3 max-w-2xl text-sm text-ink2">{application.scope}</p>
      </header>
      {query.error ? <p className="text-sm text-bad" role="alert">{query.error}</p> : null}
      <PizzaTracker status={application.status} />
      <FeeCallout cents={application.fees_due_cents} paid={Boolean(application.fees_paid_at)} />

      <ol className="grid gap-4">
        {ordered.map((step) => {
          const workflow = one(step.workflow_steps);
          const agency = one(step.agencies);
          const mine = current.isSuper || current.agencyIds.includes(step.agency_id);
          const canRoute = (current.lead || current.isSuper) && step.status === "not_started";
          return (
            <li key={step.id} className="rounded-3xl border border-line p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">{agency?.acronym} · {workflow?.name}</h2>
                <StatusBadge status={step.status} />
              </div>
              {workflow?.uncertainty ? <p className="mt-2 text-sm text-ink2">{workflow.uncertainty}</p> : null}
              {step.memo ? <p className="mt-2 text-sm">Note: {step.memo}</p> : null}
              {canRoute ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Action form={routeStepAction} step={step.id} back={back} status="queued" label="Route to this agency" />
                  <Action form={routeStepAction} step={step.id} back={back} status="n_a" label="Mark N/A" memo />
                  <Action form={routeStepAction} step={step.id} back={back} status="waived" label="Waive" memo />
                </div>
              ) : null}
              {mine && step.status === "queued" ? (
                <div className="mt-3">
                  <Action form={reviewStep} step={step.id} back={back} status="in_progress" label="Start" />
                </div>
              ) : null}
              {mine && step.status === "in_progress" ? (
                <div className="mt-3 grid gap-3">
                  <Action form={reviewStep} step={step.id} back={back} status="approved" label="Approve" memo />
                  <Action form={reviewStep} step={step.id} back={back} status="rejected" label="Reject" memo />
                  <form action={requestInfo} className="grid gap-2">
                    <input type="hidden" name="return_to" value={back} />
                    <input type="hidden" name="step_id" value={step.id} />
                    <Textarea name="body" required rows={2} placeholder="What do you need from the applicant?" />
                    <Button type="submit" variant="outline">Request information</Button>
                  </form>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {current.lead || current.isSuper ? (
        <section className="grid gap-4 rounded-3xl border border-line p-5">
          <h2 className="font-serif text-3xl font-normal">DPW controls</h2>
          {application.status === "fees_due" ? (
          <form action={assessFees} className="grid gap-2">
            <input type="hidden" name="return_to" value={back} />
            <input type="hidden" name="application_id" value={id} />
            <Input name="amount" inputMode="decimal" placeholder="Assessed amount in dollars" aria-label="Assessed amount in dollars" />
            <Input name="memo" placeholder="Why this amount" aria-label="Fee memo" />
            <Button type="submit" variant="outline">Enter fee amount</Button>
          </form>
          ) : null}
          {application.status === "fees_due" && application.fees_due_cents != null ? (
          <form action={markFeesPaid} className="grid gap-2">
            <input type="hidden" name="return_to" value={back} />
            <input type="hidden" name="application_id" value={id} />
            <Input name="memo" placeholder="Paid in person at Treasurer of Guam" aria-label="Payment memo" />
            <Button type="submit" variant="outline">Mark paid in person</Button>
          </form>
          ) : null}
          {application.status === "fees_due" && application.fees_paid_at ? (
          <form action={issuePermit} className="grid gap-2">
            <input type="hidden" name="return_to" value={back} />
            <input type="hidden" name="application_id" value={id} />
            <Input name="memo" placeholder="Issue the demo permit" aria-label="Issue memo" />
            <Button type="submit" variant="gu">Issue permit</Button>
          </form>
          ) : null}
          {["occupancy_issued", "denied", "withdrawn", "expired"].includes(application.status) ? null : (
            <>
          <form action={denyApplication} className="grid gap-2">
            <input type="hidden" name="return_to" value={back} />
            <input type="hidden" name="application_id" value={id} />
            <Input name="memo" placeholder="Reason for denial" aria-label="Denial memo" />
            <Button type="submit" variant="outline">Deny application</Button>
          </form>
          <form action={expireApplication} className="grid gap-2">
            <input type="hidden" name="return_to" value={back} />
            <input type="hidden" name="application_id" value={id} />
            <Input name="memo" placeholder="Reason for expiry" aria-label="Expiry memo" />
            <Button type="submit" variant="outline">Mark expired</Button>
          </form>
            </>
          )}
          <p className="text-sm text-muted">The three-month start rule from the building guide is not enforced automatically. A person marks expiry.</p>
        </section>
      ) : null}
    </div>
  );
}

function Action({
  form,
  step,
  back,
  status,
  label,
  memo,
}: {
  form: (data: FormData) => Promise<void>;
  step: string;
  back: string;
  status: string;
  label: string;
  memo?: boolean;
}) {
  return (
    <form action={form} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="return_to" value={back} />
      <input type="hidden" name="step_id" value={step} />
      <input type="hidden" name="status" value={status} />
      {memo ? <Input name="memo" placeholder="Memo" aria-label={`${label} memo`} className="max-w-xs" /> : null}
      <Button type="submit" variant="outline">{label}</Button>
    </form>
  );
}
