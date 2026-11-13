import Link from "next/link";
import { notFound } from "next/navigation";
import { addComment, downloadDocument, respondToInfo, saveDraft, submitDraft, uploadDocument, withdraw } from "@/lib/actions";
import { SetupNotice } from "@/components/shell";
import { ClearanceBoard, CurrentStepBanner, EtaCallout, EventTimeline, FeeCallout, PizzaTracker, StatusBadge } from "@/components/tracker";
import { Button, Input, Textarea } from "@/components/ui";
import { estimateEta, stepEstimateLabel, type StepEstimate } from "@/lib/eta";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const current = await session();
  if (!current.configured) return <SetupNotice />;
  if (!current.user) return <p><Link href={`/sign-in?next=/applications/${id}`}>Sign in</Link> to open this file.</p>;

  const { data: application } = await current.supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (!application) notFound();
  const { data: steps } = await current.supabase.from("application_steps").select("id, status, memo, agency_id, started_at, agencies(acronym, name), workflow_steps(code, name, phase, routing, sort_order, uncertainty)").eq("application_id", id);
  const { data: documents } = await current.supabase.from("documents").select("id, kind, file_name, byte_size, scan_status").eq("application_id", id);
  const { data: requests } = await current.supabase.from("info_requests").select("id, body, response, created_at").eq("application_id", id).order("created_at");
  const { data: comments } = await current.supabase.from("comments").select("id, body, visibility, created_at").eq("application_id", id).order("created_at");
  const { data: events } = await current.supabase.from("audit_log").select("id, action, memo, created_at, actor_role").eq("application_id", id).order("id", { ascending: false }).limit(40);
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

  return (
    <div className="grid gap-8">
      <header>
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial file</p>
        <h1 className="mt-2 font-serif text-5xl font-normal">Lot {application.lot || "—"}</h1>
        <p className="mt-2 text-ink2">Tract {application.tract || "—"}, block {application.block || "—"}, zone {application.zoning_district || "—"}.</p>
        <div className="mt-3"><StatusBadge status={application.status} /></div>
        {application.permit_number ? <p className="mt-3 text-sm text-ink2">Demo permit number {application.permit_number}. This is not an official DPW number.</p> : null}
      </header>
      {query.error ? <p className="text-sm text-bad" role="alert">{query.error}</p> : null}
      <PizzaTracker status={application.status} />
      {draft ? null : <EtaCallout eta={eta} />}
      <CurrentStepBanner steps={trackerSteps} />
      <ClearanceBoard steps={trackerSteps} />
      {(application.status === "fees_due" || application.fees_due_cents != null || application.fees_paid_at) ? (
        <FeeCallout cents={application.fees_due_cents} paid={Boolean(application.fees_paid_at)} />
      ) : null}
      {application.valuation_cents != null ? <p className="text-sm text-muted">Declared valuation {formatCents(application.valuation_cents)}. Not a fee.</p> : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Agency steps</h2>
        <ol className="grid gap-3">
          {ordered.map((step) => {
            const workflow = one(step.workflow_steps);
            const agency = one(step.agencies);
            return (
              <li key={step.id} className="rounded-2xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{workflow?.name}</span>
                  <StatusBadge status={step.status} />
                </div>
                <p className="text-sm text-muted">{agency?.name} · {workflow?.routing?.replaceAll("_", " ")}</p>
                {["approved", "rejected", "waived", "n_a"].includes(step.status) || workflow?.phase === "inspection" || workflow?.phase === "occupancy" ? null : (
                  <p className="mt-1 text-sm text-ink2">{stepEstimateLabel(estimateByCode.get(workflow?.code ?? ""))}</p>
                )}
                {workflow?.uncertainty ? <p className="mt-1 text-sm text-ink2">{workflow.uncertainty}</p> : null}
                {step.memo ? <p className="mt-2 text-sm">Note: {step.memo}</p> : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Documents</h2>
        <p className="text-sm text-ink2">PDF, PNG, JPEG, or WebP. The file type is checked. Virus scanning is not connected. Links expire after 60 seconds.</p>
        <ul className="grid gap-2">
          {(documents ?? []).map((document) => (
            <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-4 py-3">
              <span>{document.kind}: {document.file_name} · {document.scan_status.replaceAll("_", " ")}</span>
              <form action={downloadDocument}>
                <input type="hidden" name="application_id" value={id} />
                <input type="hidden" name="document_id" value={document.id} />
                <Button type="submit" variant="outline">Open</Button>
              </form>
            </li>
          ))}
        </ul>
        {draft || application.status === "awaiting_applicant" ? (
          <form action={uploadDocument} className="grid gap-3 rounded-3xl border border-line p-4">
            <input type="hidden" name="application_id" value={id} />
            <label className="text-sm text-ink2" htmlFor="kind">Kind</label>
            <select id="kind" name="kind" className="rounded-2xl border border-line bg-paper px-4 py-3">
              <option value="plans">Plans</option>
              <option value="plot_plan">Plot plan</option>
              <option value="other">Other</option>
            </select>
            <Input name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" required />
            <Button type="submit" variant="outline">Upload</Button>
          </form>
        ) : null}
      </section>

      {(requests ?? []).length ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-3xl font-normal">Requests for information</h2>
          {(requests ?? []).map((request) => (
            <article key={request.id} className="rounded-2xl border border-line p-4">
              <p>{request.body}</p>
              {request.response ? <p className="mt-2 text-sm text-ink2">Reply: {request.response}</p> : (
                <form action={respondToInfo} className="mt-3 grid gap-2">
                  <input type="hidden" name="application_id" value={id} />
                  <input type="hidden" name="request_id" value={request.id} />
                  <Textarea name="response" required rows={3} placeholder="Your reply" />
                  <Button type="submit">Send reply</Button>
                </form>
              )}
            </article>
          ))}
        </section>
      ) : null}

      {draft ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-3xl font-normal">Draft</h2>
          <form action={saveDraft} className="grid gap-3">
            <input type="hidden" name="application_id" value={id} />
            <Input name="lot" defaultValue={application.lot ?? ""} aria-label="Lot" />
            <Input name="tract" defaultValue={application.tract ?? ""} aria-label="Tract" />
            <Input name="block" defaultValue={application.block ?? ""} aria-label="Block" />
            <Input name="zoning_district" defaultValue={application.zoning_district ?? ""} aria-label="Zoning district" />
            <Input name="ownership" defaultValue={application.ownership ?? "owner"} aria-label="Ownership" />
            <Input name="owner_name" defaultValue={application.owner_name ?? ""} aria-label="Owner name" />
            <Textarea name="scope" defaultValue={application.scope ?? ""} aria-label="Scope" />
            <Input name="valuation" defaultValue={application.valuation_cents == null ? "" : (application.valuation_cents / 100).toFixed(2)} aria-label="Declared valuation in dollars" />
            <Input name="water_supply" defaultValue={application.water_supply ?? ""} aria-label="Water supply" />
            <Input name="contractor_license" defaultValue={application.contractor_license ?? ""} aria-label="Contractor license" />
            <Input name="architect_seal" defaultValue={application.architect_seal ?? ""} aria-label="Architect seal" />
            <Input name="engineer_seal" defaultValue={application.engineer_seal ?? ""} aria-label="Engineer seal" />
            <label className="text-sm"><input type="checkbox" name="attestation" defaultChecked={application.attestation} /> Attestation</label>
            <Input name="attestation_name" defaultValue={application.attestation_name ?? ""} aria-label="Attestation name" />
            <Button type="submit" variant="outline">Save changes</Button>
          </form>
          <form action={submitDraft}>
            <input type="hidden" name="application_id" value={id} />
            <Button type="submit" variant="gu">Submit to DPW intake</Button>
          </form>
          <p className="text-sm text-muted">Submit needs the lot fields, public sewer, a contractor license number, the attestation, a plans file, and a plot plan.</p>
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Notes</h2>
        <ul className="grid gap-2 text-sm">
          {(comments ?? []).map((comment) => <li key={comment.id} className="rounded-2xl border border-line px-4 py-3">{comment.body}</li>)}
        </ul>
        <form action={addComment} className="grid gap-2">
          <input type="hidden" name="application_id" value={id} />
          <input type="hidden" name="visibility" value="citizen" />
          <input type="hidden" name="return_to" value={`/applications/${id}`} />
          <Textarea name="body" required rows={3} placeholder="A note on this file" />
          <Button type="submit" variant="outline">Add note</Button>
        </form>
      </section>

      <EventTimeline events={(events ?? []).map((event) => ({ id: String(event.id), action: event.action, memo: event.memo, createdAt: event.created_at, actorRole: event.actor_role }))} />

      {!["occupancy_issued", "denied", "withdrawn", "expired"].includes(application.status) ? (
        <form action={withdraw} className="grid max-w-md gap-2">
          <input type="hidden" name="application_id" value={id} />
          <Input name="memo" placeholder="Why you are withdrawing" />
          <Button type="submit" variant="outline">Withdraw application</Button>
        </form>
      ) : null}
    </div>
  );
}
