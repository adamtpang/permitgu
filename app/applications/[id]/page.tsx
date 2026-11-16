import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, downloadDocument, respondToInfo, saveBuiltDraft, saveDraft, saveLicenseDraft, submitDraft, uploadDocument, withdraw } from "@/lib/actions";
import { ErrorNotice, Fold, Notice, PageHero, Section } from "@/components/layout";
import { BuiltFields } from "@/components/builder-form";
import { LicenseFields } from "@/components/license-form";
import { SetupNotice } from "@/components/shell";
import { fileTitle, licenseDetails, permitKind } from "@/lib/license";
import { ClearanceBoard, CurrentStepBanner, EtaCallout, EventTimeline, FeeCallout, PizzaTracker, StatusBadge } from "@/components/tracker";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { estimateEta, publishedTime, stepEstimateLabel, type StepEstimate } from "@/lib/eta";
import { noticeText } from "@/lib/notices";
import { builtAnswers, loadType } from "@/lib/permit-types";
import { requestMeta } from "@/lib/request-meta";
import { one, session } from "@/lib/session";
import type { TrackerStep } from "@/lib/tracker-model";
import { formatCents } from "@/lib/workflow";

export const metadata = { title: "Application" };

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const current = await session();
  if (!current.configured) return <SetupNotice />;
  if (!current.user) return <p><Link href={`/sign-in?next=/applications/${id}`}>Sign in</Link> to open this file.</p>;

  const { data: application } = await current.supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!application) notFound();
  const type = await loadType(current.supabase, { id: application.application_type_id });
  const built = type?.builder ? type : null;
  const kind = permitKind(type?.code, built);
  const answers = built ? builtAnswers(built.fields, application.details) : [];
  const license = licenseDetails(application.details);
  const { data: steps } = await current.supabase.from("application_steps").select("id, status, memo, agency_id, started_at, agencies(acronym, name), workflow_steps(code, name, phase, routing, sort_order, uncertainty)").eq("application_id", id);
  const { data: documents } = await current.supabase.from("documents").select("id, kind, file_name, byte_size, scan_status").eq("application_id", id);
  const { data: requests } = await current.supabase.from("info_requests").select("id, body, response, created_at").eq("application_id", id).order("created_at");
  const { data: comments } = await current.supabase.from("comments").select("id, body, visibility, created_at").eq("application_id", id).order("created_at");
  // Changes and opens are read separately, so a file that is opened often still shows its full history.
  const { data: events } = await current.supabase.from("audit_log").select("id, action, memo, created_at, actor_role").eq("application_id", id).neq("action", "view_application").order("id", { ascending: false }).limit(60);
  const { data: lastOpen, count: openCount } = await current.supabase.from("audit_log").select("created_at", { count: "exact" }).eq("application_id", id).eq("action", "view_application").order("id", { ascending: false }).limit(1);
  const { data: estimateRows } = await current.supabase.rpc("step_estimates");
  const estimates: StepEstimate[] = (estimateRows ?? []).map((row: { code: string; samples: number; median_seconds: number }) => ({
    code: row.code,
    samples: row.samples,
    medianSeconds: Number(row.median_seconds),
  }));
  const estimateByCode = new Map(estimates.map((estimate) => [estimate.code, estimate]));
  const meta = await requestMeta();
  await current.supabase.rpc("record_event", {
    p_application_id: id,
    p_action: "view_application",
    p_entity: "application",
    p_entity_id: id,
    p_memo: "Opened the tracker",
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  });

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
  const draft = application.status === "draft";
  const canUpload = draft || application.status === "awaiting_applicant";
  const openRequests = (requests ?? []).filter((request) => !request.response);
  const live = ordered.filter((step) => step.status !== "not_started");
  const eta = estimateEta(
    application.status,
    ordered.map((step) => ({
      code: one(step.workflow_steps)?.code ?? "",
      phase: one(step.workflow_steps)?.phase ?? "",
      routing: one(step.workflow_steps)?.routing ?? "",
      status: step.status,
      startedAt: step.started_at,
    })),
    estimates,
  );
  const place = built
    ? `Led by ${built.lead.name}.`
    : kind.license
    ? `${[license.street, license.village].filter(Boolean).join(", ") || "No address yet"}. Lot ${application.lot || "not given"}, block ${application.block || "not given"}.`
    : `Tract ${application.tract || "not given"}, block ${application.block || "not given"}, zone ${application.zoning_district || "not given"}.`;

  return (
    <div>
      <PageHero eyebrow={`Unofficial file · ${kind.typeName}`} title={fileTitle(type?.code, application, built)} lede={place}>
        <StatusBadge status={application.status} />
        {application.is_test ? <span className="rounded-full border border-warnline bg-warn px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-ink">Test file</span> : null}
        {application.permit_number ? <span className="text-[0.95rem] text-ink2">Demo number {application.permit_number}. {kind.numberNote}</span> : null}
      </PageHero>
      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={query.error} />

      {draft ? null : (
        <>
          <Section>
            <PizzaTracker status={application.status} pipeline={kind.pipeline} />
          </Section>
          <Section>
            <div className="grid gap-5">
              <CurrentStepBanner steps={trackerSteps} status={application.status} noun={kind.noun} />
              <EtaCallout eta={eta} noun={kind.noun} />
            </div>
          </Section>
        </>
      )}

      {openRequests.length ? (
        <Section title="An agency needs your reply" lede="The clock is paused until you answer.">
          <div className="grid gap-4">
            {openRequests.map((request) => (
              <article key={request.id} className="rounded-[32px] border border-warnline bg-warn p-6">
                <p className="text-lg">{request.body}</p>
                <form action={respondToInfo} className="mt-4 grid gap-3">
                  <input type="hidden" name="application_id" value={id} />
                  <input type="hidden" name="request_id" value={request.id} />
                  <Label htmlFor={`reply-${request.id}`}>Your reply</Label>
                  <Textarea id={`reply-${request.id}`} name="response" required rows={3} />
                  <Button type="submit" className="min-h-[48px] w-fit px-6 text-base">Send reply</Button>
                </form>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {(application.status === "fees_due" || application.fees_due_cents != null || application.fees_paid_at) ? (
        <Section>
          <FeeCallout cents={application.fees_due_cents} paid={Boolean(application.fees_paid_at)} where={kind.feeWhere} lead={kind.leadName} />
        </Section>
      ) : null}

      {draft ? (
        <Section title="Finish your draft" lede={kind.submitHint}>
          {built ? (
            <form action={saveBuiltDraft} className="grid max-w-2xl gap-4">
              <input type="hidden" name="application_id" value={id} />
              <BuiltFields
                fields={built.fields}
                noun={built.noun}
                values={Object.fromEntries(answers.map((answer) => [answer.field.key, answer.value]))}
                attestation={application.attestation}
                attestationName={application.attestation_name ?? ""}
              />
              <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Save changes</Button>
            </form>
          ) : kind.license ? (
            <form action={saveLicenseDraft} className="grid max-w-2xl gap-4">
              <input type="hidden" name="application_id" value={id} />
              <LicenseFields
                values={{
                  ...license,
                  activity: application.scope ?? "",
                  lot: application.lot ?? "",
                  block: application.block ?? "",
                  attestation: application.attestation,
                  attestationName: application.attestation_name ?? "",
                }}
              />
              <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Save changes</Button>
            </form>
          ) : (
            <form action={saveDraft} className="grid max-w-2xl gap-4">
              <input type="hidden" name="application_id" value={id} />
              <DraftField name="lot" label="Lot" value={application.lot} />
              <DraftField name="tract" label="Tract" value={application.tract} />
              <DraftField name="block" label="Block" value={application.block} />
              <DraftField name="zoning_district" label="Zoning district" value={application.zoning_district} />
              <DraftField name="ownership" label="Who is applying: owner, lessee, or authorized_agent" value={application.ownership ?? "owner"} />
              <DraftField name="owner_name" label="Owner name, if you are an agent" value={application.owner_name} />
              <div>
                <Label htmlFor="scope">Scope</Label>
                <Textarea id="scope" name="scope" rows={3} defaultValue={application.scope ?? ""} />
              </div>
              <DraftField name="valuation" label="Declared construction valuation, dollars (optional)" value={application.valuation_cents == null ? "" : (application.valuation_cents / 100).toFixed(2)} />
              <DraftField name="water_supply" label="Water supply: public or private_well" value={application.water_supply} />
              <DraftField name="contractor_license" label="Contractor license number" value={application.contractor_license} />
              <DraftField name="architect_seal" label="Architect seal number, if you have one" value={application.architect_seal} />
              <DraftField name="engineer_seal" label="Engineer seal number, if you have one" value={application.engineer_seal} />
              <label className="flex items-start gap-3 text-[0.95rem] text-ink2">
                <input className="mt-1" type="checkbox" name="attestation" defaultChecked={application.attestation} />
                <span>I attest that the owner or lessee will sign the official DPW paper. This checkbox does not replace that signature.</span>
              </label>
              <DraftField name="attestation_name" label="Name for that attestation" value={application.attestation_name} />
              <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Save changes</Button>
            </form>
          )}
        </Section>
      ) : null}

      {canUpload ? (
        <Section title="Add your papers" lede="PDF, PNG, JPEG, or WebP, up to 20 MB each.">
          <form action={uploadDocument} className="grid max-w-2xl gap-4 rounded-[32px] border border-line p-6">
            <input type="hidden" name="application_id" value={id} />
            <div>
              <Label htmlFor="kind">What is it</Label>
              <select id="kind" name="kind" className="w-full rounded-2xl border border-line bg-paper px-4 py-3">
                {kind.documents.map((document) => <option key={document.code} value={document.code}>{document.name}</option>)}
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required />
            </div>
            <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Upload</Button>
          </form>
          <p className="mt-4 max-w-[38rem] text-[0.95rem] text-ink2">
            The file type is checked. Virus scanning is not connected. Do not upload a real ID on this unofficial demo.
          </p>
        </Section>
      ) : null}

      {draft ? (
        <Section title="Ready?" lede="Submitting sends the file to intake and locks the draft.">
          <form action={submitDraft}>
            <input type="hidden" name="application_id" value={id} />
            <Button type="submit" variant="gu" className="min-h-[56px] px-8 text-lg">{kind.submitLabel}</Button>
          </form>
        </Section>
      ) : null}

      <Section title="The details">
        <Fold title="Every step" note={draft ? `${ordered.length}` : `${live.length} started of ${ordered.length}`}>
          <ol className="grid gap-5">
            {ordered.map((step) => {
              const workflow = one(step.workflow_steps);
              const agency = one(step.agencies);
              const published = publishedTime(workflow?.code ?? "");
              const finished = ["approved", "rejected", "waived", "n_a"].includes(step.status);
              return (
                <li key={step.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg font-medium">{workflow?.name}</span>
                    <StatusBadge status={step.status} />
                  </div>
                  <p className="text-[0.95rem] text-muted">{agency?.name}</p>
                  {finished || workflow?.phase === "inspection" || workflow?.phase === "occupancy" ? null : (
                    <p className="mt-1 text-[0.95rem] text-ink2">{stepEstimateLabel(estimateByCode.get(workflow?.code ?? ""))}</p>
                  )}
                  {published ? (
                    <p className="mt-1 text-[0.95rem] text-ink2">
                      {published.text} <a href={published.source} target="_blank" rel="noopener noreferrer">Public Auditor report 25-05</a>
                    </p>
                  ) : null}
                  {step.memo ? <p className="mt-2 text-[0.95rem]">Note from the agency: {step.memo}</p> : null}
                  {workflow?.uncertainty ? (
                    <details className="mt-1 text-[0.95rem] text-ink2">
                      <summary className="inline-flex min-h-[44px] items-center underline underline-offset-4">Why this step</summary>
                      <p className="max-w-[38rem] pb-2">{workflow.uncertainty}</p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Fold>

        {built && !draft ? (
          <Fold title="Your answers" note={`${answers.filter((answer) => answer.value).length}`}>
            <dl className="grid gap-4">
              {answers.map((answer) => (
                <div key={answer.field.key}>
                  <dt className="text-[0.95rem] text-muted">{answer.field.label}</dt>
                  <dd className="text-lg">{answer.value || "Not answered"}</dd>
                </div>
              ))}
            </dl>
          </Fold>
        ) : null}

        <Fold title="Agencies" note={`${new Set(trackerSteps.map((step) => step.agency)).size}`}>
          <ClearanceBoard steps={trackerSteps} heading={false} />
        </Fold>

        <Fold title="Papers" note={`${(documents ?? []).length}`}>
          <ul className="grid gap-3">
            {(documents ?? []).map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {kind.documents.find((entry) => entry.code === document.kind)?.name ?? "Other"}: {document.file_name}
                </span>
                <form action={downloadDocument}>
                  <input type="hidden" name="application_id" value={id} />
                  <input type="hidden" name="document_id" value={document.id} />
                  <Button type="submit" variant="outline" className="min-h-[44px] px-5">Open</Button>
                </form>
              </li>
            ))}
          </ul>
          {(documents ?? []).length ? <p className="mt-3 text-[0.95rem] text-ink2">A link to a file works for 60 seconds.</p> : <p className="text-ink2">Nothing uploaded yet.</p>}
        </Fold>

        {(requests ?? []).some((request) => request.response) ? (
          <Fold title="Answered requests" note={`${(requests ?? []).filter((request) => request.response).length}`}>
            <ul className="grid gap-4">
              {(requests ?? []).filter((request) => request.response).map((request) => (
                <li key={request.id}>
                  <p>{request.body}</p>
                  <p className="mt-1 text-[0.95rem] text-ink2">Your reply: {request.response}</p>
                </li>
              ))}
            </ul>
          </Fold>
        ) : null}

        <Fold title="Notes" note={`${(comments ?? []).length}`}>
          <ul className="grid gap-3">
            {(comments ?? []).map((comment) => <li key={comment.id} className="rounded-2xl border border-line px-4 py-3">{comment.body}</li>)}
          </ul>
          <form action={addComment} className="mt-4 grid max-w-2xl gap-3">
            <input type="hidden" name="application_id" value={id} />
            <input type="hidden" name="visibility" value="citizen" />
            <input type="hidden" name="return_to" value={`/applications/${id}`} />
            <Label htmlFor="note-body">Add a note to this file</Label>
            <Textarea id="note-body" name="body" required rows={3} />
            <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Add note</Button>
          </form>
        </Fold>

        <Fold title="History" note={`${(events ?? []).length} ${(events ?? []).length === 1 ? "change" : "changes"}`}>
          <EventTimeline heading={false} opens={{ count: openCount ?? 0, last: lastOpen?.[0]?.created_at ?? null }} events={(events ?? []).map((event) => ({ id: String(event.id), action: event.action, memo: event.memo, createdAt: event.created_at, actorRole: event.actor_role }))} />
        </Fold>

        {application.valuation_cents != null ? (
          <p className="mt-6 text-[0.95rem] text-muted">Declared valuation {formatCents(application.valuation_cents)}. Not a fee.</p>
        ) : null}

        {!["occupancy_issued", "issued", "denied", "withdrawn", "expired"].includes(application.status) ? (
          <Fold title="Withdraw this application">
            <form action={withdraw} className="grid max-w-md gap-3">
              <input type="hidden" name="application_id" value={id} />
              <Label htmlFor="withdraw-memo">Why you are withdrawing</Label>
              <Input id="withdraw-memo" name="memo" />
              <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Withdraw application</Button>
            </form>
          </Fold>
        ) : null}
      </Section>
    </div>
  );
}

function DraftField({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value ?? ""} />
    </div>
  );
}
