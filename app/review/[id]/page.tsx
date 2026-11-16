import Link from "next/link";
import { notFound } from "next/navigation";
import { assessFees, assignStep, denyApplication, downloadDocument, expireApplication, issuePermit, markFeesPaid, requestInfo, reviewStep, routeStepAction, setTestFile } from "@/lib/actions";
import { ErrorNotice, Fold, Notice, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { ClearanceBoard, EventTimeline, FeeCallout, PizzaTracker, StatusBadge } from "@/components/tracker";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { fileTitle, licenseDetails, permitKind } from "@/lib/license";
import { noticeText } from "@/lib/notices";
import { builtAnswers, loadType } from "@/lib/permit-types";
import { requestMeta } from "@/lib/request-meta";
import { one, staffSession } from "@/lib/session";
import type { TrackerStep } from "@/lib/tracker-model";
import { canTransitionApplication, type ApplicationStatus } from "@/lib/workflow";

export const metadata = { title: "Review application" };

const ACTIVE = ["queued", "in_progress", "info_requested"];
const FINISHED = ["approved", "rejected", "waived", "n_a"];

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (current.aal !== "aal2") return <p><Link href="/staff/sign-in">Verify your authenticator app</Link> to review.</p>;

  const { data: application } = await current.supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!application) notFound();
  const { data: type } = await current.supabase.from("application_types").select("code, lead_agency_id").eq("id", application.application_type_id).maybeSingle();
  const loaded = await loadType(current.supabase, { id: application.application_type_id });
  const built = loaded?.builder ? loaded : null;
  const kind = permitKind(type?.code, built);
  const answers = built ? builtAnswers(built.fields, application.details) : [];
  const license = licenseDetails(application.details);
  // The lead agency runs the file: DPW for the house permit, Revenue and Taxation for the license.
  const isLead = current.staff.some((member) => member.agency_id === type?.lead_agency_id && (member.role === "reviewer" || member.role === "agency_admin"));
  const runs = isLead || current.isSuper;
  const { data: steps } = await current.supabase.from("application_steps").select("id, status, memo, agency_id, assignee_id, agencies(code, acronym, name), workflow_steps(code, name, routing, sort_order, uncertainty)").eq("application_id", id);
  const { data: documents } = await current.supabase.from("documents").select("id, kind, file_name").eq("application_id", id);
  const { data: events } = await current.supabase.from("audit_log").select("id, action, memo, created_at, actor_role").eq("application_id", id).neq("action", "view_application").order("id", { ascending: false }).limit(80);
  const { data: lastOpen, count: openCount } = await current.supabase.from("audit_log").select("created_at", { count: "exact" }).eq("application_id", id).eq("action", "view_application").order("id", { ascending: false }).limit(1);
  const meta = await requestMeta();
  await current.supabase.rpc("record_event", {
    p_application_id: id,
    p_action: "view_application",
    p_entity: "application",
    p_entity_id: id,
    p_memo: "Staff opened the file",
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });
  const { data: directory } = await current.supabase.from("memberships").select("user_id, agency_id, role, profiles(full_name)").in("role", ["reviewer", "agency_admin"]);
  const ordered = [...(steps ?? [])].sort((a, b) => (one(a.workflow_steps)?.sort_order ?? 0) - (one(b.workflow_steps)?.sort_order ?? 0));
  const trackerSteps: TrackerStep[] = ordered.map((step) => ({
    id: step.id,
    name: one(step.workflow_steps)?.name ?? "Step",
    agency: one(step.agencies)?.acronym ?? "Agency",
    agencyName: one(step.agencies)?.name ?? "Agency",
    status: step.status,
    routing: one(step.workflow_steps)?.routing ?? "",
    sort: one(step.workflow_steps)?.sort_order ?? 0,
    uncertainty: one(step.workflow_steps)?.uncertainty ?? null,
    memo: step.memo,
  }));
  const back = `/review/${id}`;
  const status = application.status as ApplicationStatus;
  const isMine = (step: (typeof ordered)[number]) => current.isSuper || current.agencyIds.includes(step.agency_id);
  // The fee and issue steps are worked from the lead controls, not as ordinary review steps.
  const leadWorked = new Set(["fees", "issuance"]);
  const phaseOf = (step: (typeof ordered)[number]) => {
    const code = one(step.workflow_steps)?.code ?? "";
    return code === "fee_assessment" || code === "tog_payment" ? "fees" : /issue/.test(code) ? "issuance" : "review";
  };
  const needsMe = ordered.filter((step) => isMine(step) && ACTIVE.includes(step.status) && !leadWorked.has(phaseOf(step)));
  const elsewhere = ordered.filter((step) => !isMine(step) && ACTIVE.includes(step.status));
  // Only steps a reviewer adds by hand. Steps on every file queue themselves when their stage opens.
  const unrouted = ordered.filter((step) => step.status === "not_started" && ["as_indicated", "gated"].includes(one(step.workflow_steps)?.routing ?? ""));
  const finished = ordered.filter((step) => FINISHED.includes(step.status));
  const canAssign = (step: (typeof ordered)[number]) =>
    runs || current.staff.some((member) => member.role === "agency_admin" && member.agency_id === step.agency_id);
  const feeDue = status === "fees_due";
  // More agencies can only join while the file is still being reviewed.
  const canRoute = runs && ["submitted", "intake", "plan_review", "clearances_in_progress", "awaiting_applicant"].includes(status);
  const canDeny = canTransitionApplication(status, "denied");
  const canExpire = canTransitionApplication(status, "expired");

  return (
    <div>
      <header className="pb-8 pt-8">
        <p className="text-[0.95rem]"><Link href="/review">Back to the queue</Link></p>
        <p className="mt-6 text-sm font-medium uppercase tracking-wider text-muted">{kind.typeName}</p>
        <h1 className="display-sm mt-3">{fileTitle(type?.code, application, built)}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusBadge status={application.status} />
          {application.is_sample ? <span className="rounded-full border border-warnline bg-warn px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink">Sample file</span> : null}
          {application.is_test ? <span className="rounded-full border border-warnline bg-warn px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink">Test file</span> : null}
          {application.permit_number ? <span className="text-[0.95rem] text-ink2">Demo number {application.permit_number}</span> : null}
        </div>
        <p className="mt-4 max-w-[38rem] text-lg text-ink2">{application.scope}</p>
        {built ? (
          <dl className="mt-2 grid max-w-[38rem] gap-3">
            {answers.map((answer) => (
              <div key={answer.field.key}>
                <dt className="text-[0.95rem] text-muted">{answer.field.label}</dt>
                <dd>{answer.value || "Not answered"}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className="mt-2 max-w-[38rem] text-[0.95rem] text-ink2">
          {built ? `Attested by ${application.attestation_name || "no one yet"}.` : kind.license
            ? `${license.entityType.replaceAll("_", " ")}${license.tradeName ? `, trading as ${license.tradeName}` : ""}${license.registrationNumber ? `, registration ${license.registrationNumber}` : ""}. ${[license.street, license.village].filter(Boolean).join(", ")}. Lot ${application.lot}, block ${application.block}.`
            : `Lot ${application.lot}, tract ${application.tract}, block ${application.block}. Zone ${application.zoning_district}. Contractor ${application.contractor_license || "not given"}.`}
        </p>
      </header>
      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={query.error} />

      <Section className="pt-2">
        <PizzaTracker status={application.status} pipeline={kind.pipeline} />
      </Section>

      <Section title="Needs you" lede={needsMe.length ? undefined : "Nothing on this file is waiting on your agency."}>
        <ol className="grid gap-4">
          {needsMe.map((step) => {
            const workflow = one(step.workflow_steps);
            const agency = one(step.agencies);
            return (
              <li key={step.id} className="rounded-[32px] border border-navy p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-serif text-[clamp(1.5rem,3.4vw,2rem)] leading-tight tracking-[-0.02em]">{workflow?.name}</h3>
                  <StatusBadge status={step.status} />
                </div>
                <p className="mt-1 text-[0.95rem] text-muted">{agency?.name}</p>
                {step.memo ? <p className="mt-2 text-[0.95rem]">Note: {step.memo}</p> : null}
                {step.status === "queued" ? (
                  <div className="mt-4">
                    <StepAction action={reviewStep} step={step.id} back={back} status="in_progress" label="Start review" primary />
                  </div>
                ) : null}
                {step.status === "in_progress" ? (
                  <div className="mt-4 grid gap-5">
                    <StepAction action={reviewStep} step={step.id} back={back} status="approved" label="Approve" memo="Note for the applicant (optional)" primary />
                    <details>
                      <summary className="inline-flex min-h-[44px] items-center underline underline-offset-4">Ask for information, or reject</summary>
                      <div className="mt-3 grid gap-5">
                        <form action={requestInfo} className="grid max-w-xl gap-2">
                          <input type="hidden" name="return_to" value={back} />
                          <input type="hidden" name="step_id" value={step.id} />
                          <Label htmlFor={`ask-${step.id}`}>What do you need from the applicant?</Label>
                          <Textarea id={`ask-${step.id}`} name="body" required rows={2} />
                          <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Request information</Button>
                        </form>
                        <StepAction action={reviewStep} step={step.id} back={back} status="rejected" label="Reject" memo="Reason, shown to the applicant (required)" />
                      </div>
                    </details>
                  </div>
                ) : null}
                {step.status === "info_requested" ? <p className="mt-3 text-ink2">Waiting on the applicant&rsquo;s reply.</p> : null}
                {workflow?.uncertainty ? (
                  <details className="mt-3 text-[0.95rem] text-ink2">
                    <summary className="inline-flex min-h-[44px] items-center underline underline-offset-4">About this step</summary>
                    <p className="max-w-[38rem] pb-2">{workflow.uncertainty}</p>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Section>

      {runs && (feeDue || application.fees_due_cents != null) ? (
        <Section title={feeDue ? "Fee and issue" : undefined}>
          <div className="grid gap-6">
            <FeeCallout cents={application.fees_due_cents} paid={Boolean(application.fees_paid_at)} where={kind.feeWhere} lead={kind.leadName} />
            {feeDue && application.fees_due_cents == null ? (
              <form action={assessFees} className="grid max-w-xl gap-3 rounded-[32px] border border-navy p-6">
                <input type="hidden" name="return_to" value={back} />
                <input type="hidden" name="application_id" value={id} />
                <div>
                  <Label htmlFor="fee-amount">Assessed amount, in dollars</Label>
                  <Input id="fee-amount" name="amount" inputMode="decimal" required />
                </div>
                <div>
                  <Label htmlFor="fee-memo">Why this amount (required)</Label>
                  <Input id="fee-memo" name="memo" required />
                </div>
                <Button type="submit" className="min-h-[48px] w-fit px-6 text-base">Enter the fee</Button>
              </form>
            ) : null}
            {feeDue && application.fees_due_cents != null && !application.fees_paid_at ? (
              <form action={markFeesPaid} className="grid max-w-xl gap-3 rounded-[32px] border border-navy p-6">
                <input type="hidden" name="return_to" value={back} />
                <input type="hidden" name="application_id" value={id} />
                <div>
                  <Label htmlFor="paid-memo">Where and when it was paid (required)</Label>
                  <Input id="paid-memo" name="memo" required />
                </div>
                <Button type="submit" className="min-h-[48px] w-fit px-6 text-base">Mark paid in person</Button>
              </form>
            ) : null}
            {feeDue && application.fees_paid_at ? (
              <form action={issuePermit} className="grid max-w-xl gap-3 rounded-[32px] border border-navy p-6">
                <input type="hidden" name="return_to" value={back} />
                <input type="hidden" name="application_id" value={id} />
                <div>
                  <Label htmlFor="issue-memo">Note for the record (required)</Label>
                  <Input id="issue-memo" name="memo" required />
                </div>
                <Button type="submit" variant="gu" className="min-h-[52px] w-fit px-8 text-lg">Issue the {kind.noun}</Button>
                <p className="text-[0.95rem] text-ink2">This assigns a demo number. It is not an official agency number.</p>
              </form>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="The file">
        <Fold title="Applicant's papers" note={`${(documents ?? []).length}`}>
          <ul className="grid gap-3">
            {(documents ?? []).map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>{kind.documents.find((entry) => entry.code === document.kind)?.name ?? "Other"}: {document.file_name}</span>
                {application.is_sample ? null : (
                  <form action={downloadDocument}>
                    <input type="hidden" name="application_id" value={id} />
                    <input type="hidden" name="document_id" value={document.id} />
                    <input type="hidden" name="return_to" value={back} />
                    <Button type="submit" variant="outline" className="min-h-[44px] px-5">Open</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {application.is_sample ? (
            <p className="mt-3 text-[0.95rem] text-ink2">A sample file lists its papers by name only. There is no upload behind them to open.</p>
          ) : (documents ?? []).length ? <p className="mt-3 text-[0.95rem] text-ink2">Opening a paper is logged. The link works for 60 seconds.</p> : <p className="text-ink2">Nothing uploaded.</p>}
        </Fold>

        {elsewhere.length ? (
          <Fold title="With other agencies" note={`${elsewhere.length}`}>
            <StepRows steps={elsewhere} back={back} canAssign={canAssign} directory={directory ?? []} />
          </Fold>
        ) : null}

        {canRoute && unrouted.length ? (
          <Fold title="Route another agency" note={`${unrouted.length} optional`}>
            <ol className="grid gap-6">
              {unrouted.map((step) => {
                const workflow = one(step.workflow_steps);
                const agency = one(step.agencies);
                return (
                  <li key={step.id}>
                    <p className="text-lg font-medium">{workflow?.name}</p>
                    <p className="text-[0.95rem] text-muted">{agency?.name}</p>
                    {workflow?.uncertainty ? <p className="mt-1 max-w-[38rem] text-[0.95rem] text-ink2">{workflow.uncertainty}</p> : null}
                    <div className="mt-3 grid gap-3">
                      <StepAction action={routeStepAction} step={step.id} back={back} status="queued" label="Send to this agency" />
                      <StepAction action={routeStepAction} step={step.id} back={back} status="n_a" label="Mark not needed" memo="Why it does not apply (required)" />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Fold>
        ) : null}

        <Fold title="Finished steps" note={`${finished.length}`}>
          <StepRows steps={finished} back={back} canAssign={() => false} directory={[]} />
          {finished.length ? null : <p className="text-ink2">None yet.</p>}
        </Fold>

        {needsMe.some(canAssign) ? (
          <Fold title="Assign a reviewer" note={`${needsMe.filter(canAssign).length}`}>
            <StepRows steps={needsMe.filter(canAssign)} back={back} canAssign={canAssign} directory={directory ?? []} />
          </Fold>
        ) : null}

        <Fold title="Agencies" note={`${new Set(trackerSteps.map((step) => step.agency)).size}`}>
          <ClearanceBoard steps={trackerSteps} heading={false} />
        </Fold>

        <Fold title="History" note={`${(events ?? []).length} ${(events ?? []).length === 1 ? "change" : "changes"}`}>
          <EventTimeline heading={false} opens={{ count: openCount ?? 0, last: lastOpen?.[0]?.created_at ?? null }} events={(events ?? []).map((event) => ({ id: String(event.id), action: event.action, memo: event.memo, createdAt: event.created_at, actorRole: event.actor_role }))} />
        </Fold>

        {current.isSuper ? (
          <Fold title="Test file" note={application.is_test ? "yes" : "no"}>
            <p className="max-w-[38rem] text-ink2">
              A test file is one a tester walked through. Its step timings are left out of the estimates that applicants see.
            </p>
            <form action={setTestFile} className="mt-4">
              <input type="hidden" name="application_id" value={id} />
              <input type="hidden" name="is_test" value={application.is_test ? "false" : "true"} />
              <Button type="submit" variant="outline" className="min-h-[44px] px-5">
                {application.is_test ? "Count this file in estimates" : "Mark as a test file"}
              </Button>
            </form>
          </Fold>
        ) : null}

        {runs && (canDeny || canExpire) ? (
          <Fold title="Close this file">
            <div className="grid max-w-xl gap-6">
              {canDeny ? (
                <form action={denyApplication} className="grid gap-2">
                  <input type="hidden" name="return_to" value={back} />
                  <input type="hidden" name="application_id" value={id} />
                  <Label htmlFor="deny-memo">Reason for denial, shown to the applicant (required)</Label>
                  <Input id="deny-memo" name="memo" required />
                  <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Deny application</Button>
                </form>
              ) : null}
              {canExpire ? (
                <form action={expireApplication} className="grid gap-2">
                  <input type="hidden" name="return_to" value={back} />
                  <input type="hidden" name="application_id" value={id} />
                  <Label htmlFor="expire-memo">Reason for expiry (required)</Label>
                  <Input id="expire-memo" name="memo" required />
                  <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Mark expired</Button>
                </form>
              ) : null}
              {kind.license ? null : (
                <p className="text-[0.95rem] text-muted">The rule that work must start within a set time is not enforced automatically. A person marks expiry.</p>
              )}
            </div>
          </Fold>
        ) : null}
      </Section>
    </div>
  );
}

type StepRow = {
  id: string;
  status: string;
  memo: string | null;
  agency_id: string;
  assignee_id: string | null;
  agencies: unknown;
  workflow_steps: unknown;
};

function StepRows({
  steps,
  back,
  canAssign,
  directory,
}: {
  steps: StepRow[];
  back: string;
  canAssign: (step: never) => boolean;
  directory: { user_id: string; agency_id: string | null; profiles: unknown }[];
}) {
  return (
    <ol className="grid gap-5">
      {steps.map((step) => {
        const workflow = one(step.workflow_steps as { name: string } | { name: string }[] | null);
        const agency = one(step.agencies as { name: string } | { name: string }[] | null);
        const people = directory.filter((member) => member.agency_id === step.agency_id);
        return (
          <li key={step.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lg font-medium">{workflow?.name}</span>
              <StatusBadge status={step.status} />
            </div>
            <p className="text-[0.95rem] text-muted">{agency?.name}</p>
            {step.memo ? <p className="mt-1 text-[0.95rem]">Note: {step.memo}</p> : null}
            {canAssign(step as never) && people.length ? (
              <form action={assignStep} className="mt-3 grid max-w-xl gap-2">
                <input type="hidden" name="return_to" value={back} />
                <input type="hidden" name="step_id" value={step.id} />
                <Label htmlFor={`assignee-${step.id}`}>Reviewer</Label>
                <select id={`assignee-${step.id}`} name="assignee" defaultValue={step.assignee_id ?? ""} className="rounded-2xl border border-line bg-paper px-4 py-3">
                  <option value="">Unassigned</option>
                  {people.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {one(member.profiles as { full_name: string | null } | { full_name: string | null }[] | null)?.full_name ?? member.user_id}
                    </option>
                  ))}
                </select>
                <Label htmlFor={`assign-memo-${step.id}`}>Why this assignment (required)</Label>
                <Input id={`assign-memo-${step.id}`} name="memo" required />
                <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Save assignment</Button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StepAction({
  action,
  step,
  back,
  status,
  label,
  memo,
  primary,
}: {
  action: (data: FormData) => Promise<void>;
  step: string;
  back: string;
  status: string;
  label: string;
  memo?: string;
  primary?: boolean;
}) {
  const field = `memo-${status}-${step}`;
  return (
    <form action={action} className="grid max-w-xl gap-2">
      <input type="hidden" name="return_to" value={back} />
      <input type="hidden" name="step_id" value={step} />
      <input type="hidden" name="status" value={status} />
      {memo ? (
        <>
          <Label htmlFor={field}>{memo}</Label>
          <Input id={field} name="memo" required={/required/.test(memo)} />
        </>
      ) : null}
      <Button type="submit" variant={primary ? "default" : "outline"} className="min-h-[48px] w-fit px-6 text-base">{label}</Button>
    </form>
  );
}
