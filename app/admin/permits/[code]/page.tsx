import Link from "next/link";
import { notFound } from "next/navigation";
import { addTypeDocument, addTypeField, addTypeStep, removeTypeDocument, removeTypeField, removeTypeStep, setTypeActive } from "@/lib/actions";
import { ErrorNotice, Fold, Glance, Notice, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { noticeText } from "@/lib/notices";
import { FIELD_KINDS, loadType, readiness, STEP_ROUTINGS } from "@/lib/permit-types";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Edit permit" };

const ERRORS: Record<string, string> = {
  already_exists: "Something with that name is already on this permit.",
  step_in_use: "A file already uses that step, so it stays. Switch the permit off to stop new files.",
  document_in_use: "A file already has that paper, so it stays on the list.",
  bad_choices: "A list question needs 2 to 12 answers, one per line.",
  bad_name: "The name is too short or too long.",
  too_many_fields: "A permit can have up to 30 questions.",
  too_many_documents: "A permit can have up to 12 papers.",
  unknown_agency: "Pick an agency from the list.",
};

export default async function PermitEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { code } = await params;
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (!("isSuper" in current) || current.aal !== "aal2" || !current.isSuper) return <p>The permit builder needs a super admin and an authenticator app.</p>;

  const type = await loadType(current.supabase, { code });
  if (!type || !type.builder) notFound();
  const { data: agencies } = await current.supabase.from("agencies").select("code, acronym, name").order("name");
  const missing = readiness(type);
  const review = type.steps.filter((step) => step.phase === "clearance");
  const fixed = type.steps.filter((step) => step.phase !== "clearance");
  const error = query.error ? ERRORS[query.error.split(":")[0].trim()] ?? query.error : undefined;
  const select = "w-full rounded-2xl border border-line bg-paper px-4 py-3";

  return (
    <div>
      <PageHero eyebrow={`Permit builder · ${type.lead.name} leads`} title={`${type.name}.`} lede={type.summary || "No summary yet."}>
        <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${type.active ? "border-ink bg-ink text-paper" : "border-warnline bg-warn text-ink"}`}>
          {type.active ? "On" : "Off"}
        </span>
        <Link className="inline-flex min-h-[44px] items-center text-[0.95rem]" href="/admin/permits">All built permits</Link>
        {type.active ? <Link className="inline-flex min-h-[44px] items-center text-[0.95rem]" href={`/apply/${type.code}`}>See the public page</Link> : null}
      </PageHero>
      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={error} />

      <Section>
        <Glance
          facts={[
            { value: type.fields.length, label: type.fields.length === 1 ? "question" : "questions" },
            { value: review.length, label: review.length === 1 ? "review step" : "review steps" },
            { value: type.documents.length, label: type.documents.length === 1 ? "paper" : "papers" },
            { value: new Set(type.steps.map((step) => step.agency)).size, label: "agencies" },
          ]}
        />
      </Section>

      <Section
        title={type.active ? "People can start this permit" : "Switch it on"}
        lede={type.active ? "Switching it off stops new files. Files already submitted keep going." : missing.length ? `Still needed: ${missing.join(", ")}.` : "Everything needed is here."}
      >
        <form action={setTypeActive}>
          <input type="hidden" name="type_code" value={type.code} />
          <input type="hidden" name="active" value={type.active ? "false" : "true"} />
          {type.active ? (
            <Button type="submit" variant="outline" className="min-h-[52px] px-7 text-lg">Switch off</Button>
          ) : (
            <Button type="submit" variant="gu" className="min-h-[52px] px-7 text-lg" disabled={missing.length > 0}>Switch on</Button>
          )}
        </form>
      </Section>

      <Section title="Questions" lede="What the applicant answers. The first one names the file in lists.">
        <ul className="grid gap-3">
          {type.fields.map((field) => (
            <li key={field.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span>
                <span className="font-medium">{field.label}</span>
                <span className="text-[0.95rem] text-muted"> · {FIELD_KINDS.find((kind) => kind.value === field.kind)?.label} · {field.required ? "required" : "optional"}</span>
                {field.kind === "choice" ? <span className="block text-[0.95rem] text-ink2">{field.choices.join(", ")}</span> : null}
              </span>
              <form action={removeTypeField}>
                <input type="hidden" name="type_code" value={type.code} />
                <input type="hidden" name="key" value={field.key} />
                <Button type="submit" variant="outline" className="min-h-[44px] px-5" aria-label={`Remove question: ${field.label}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <Fold title="Add a question" open={!type.fields.length}>
          <form action={addTypeField} className="grid max-w-2xl gap-4">
            <input type="hidden" name="type_code" value={type.code} />
            <div>
              <Label htmlFor="label">Question</Label>
              <Input id="label" name="label" required maxLength={120} placeholder="Name of the establishment" />
            </div>
            <div>
              <Label htmlFor="kind">Kind of answer</Label>
              <select id="kind" name="kind" className={select}>
                {FIELD_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="choices">Answers to pick from, one per line (list questions only)</Label>
              <Textarea id="choices" name="choices" rows={3} />
            </div>
            <div>
              <Label htmlFor="help">Hint under the question (optional)</Label>
              <Input id="help" name="help" maxLength={300} />
            </div>
            <label className="flex items-center gap-3 text-[0.95rem]">
              <input type="checkbox" name="required" defaultChecked /> Required before submitting
            </label>
            <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Add question</Button>
          </form>
        </Fold>
      </Section>

      <Section title="Review steps" lede="Who has to clear the file between intake and the fee. They all open together once intake is approved.">
        <ul className="grid gap-3">
          {review.map((step) => (
            <li key={step.code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span>
                <span className="font-medium">{step.name}</span>
                <span className="text-[0.95rem] text-muted"> · {step.agency.toUpperCase()} · {STEP_ROUTINGS.find((routing) => routing.value === step.routing)?.label ?? step.routing}</span>
                {step.uncertainty ? <span className="block max-w-[38rem] text-[0.95rem] text-ink2">{step.uncertainty}</span> : null}
              </span>
              <form action={removeTypeStep}>
                <input type="hidden" name="type_code" value={type.code} />
                <input type="hidden" name="step_code" value={step.code} />
                <Button type="submit" variant="outline" className="min-h-[44px] px-5" aria-label={`Remove step: ${step.name}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <Fold title="Add a review step" open={!review.length}>
          <form action={addTypeStep} className="grid max-w-2xl gap-4">
            <input type="hidden" name="type_code" value={type.code} />
            <div>
              <Label htmlFor="step-name">Step</Label>
              <Input id="step-name" name="name" required maxLength={120} placeholder="Pre-operational inspection" />
            </div>
            <div>
              <Label htmlFor="agency_code">Agency that does it</Label>
              <select id="agency_code" name="agency_code" className={select} defaultValue={type.lead.code}>
                {(agencies ?? []).map((agency) => <option key={agency.code} value={agency.code}>{agency.name} ({agency.acronym})</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="routing">When it applies</Label>
              <select id="routing" name="routing" className={select}>
                {STEP_ROUTINGS.map((routing) => <option key={routing.value} value={routing.value}>{routing.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="note">Why this step, and where that comes from</Label>
              <Textarea id="note" name="note" rows={3} maxLength={600} />
              <p className="mt-1 text-sm text-muted">Shown to the applicant. Say so if it is not confirmed.</p>
            </div>
            <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Add step</Button>
          </form>
        </Fold>
        <Fold title="Steps every built permit has" note={`${fixed.length}`}>
          <ul className="grid gap-2 text-[0.95rem] text-ink2">
            {fixed.map((step) => <li key={step.code}>{step.name} · {step.agency.toUpperCase()}</li>)}
          </ul>
        </Fold>
      </Section>

      <Section title="Papers" lede="What the applicant uploads before submitting. Leave it empty if nothing is needed.">
        <ul className="grid gap-3">
          {type.documents.map((document) => (
            <li key={document.code} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span>
                <span className="font-medium">{document.name}</span>
                {document.notes ? <span className="block text-[0.95rem] text-ink2">{document.notes}</span> : null}
              </span>
              <form action={removeTypeDocument}>
                <input type="hidden" name="type_code" value={type.code} />
                <input type="hidden" name="code" value={document.code} />
                <Button type="submit" variant="outline" className="min-h-[44px] px-5" aria-label={`Remove paper: ${document.name}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <Fold title="Add a paper">
          <form action={addTypeDocument} className="grid max-w-2xl gap-4">
            <input type="hidden" name="type_code" value={type.code} />
            <div>
              <Label htmlFor="paper-name">Paper</Label>
              <Input id="paper-name" name="name" required maxLength={120} placeholder="Floor plan" />
            </div>
            <div>
              <Label htmlFor="paper-notes">Note for the applicant (optional)</Label>
              <Input id="paper-notes" name="notes" maxLength={300} />
            </div>
            <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Add paper</Button>
          </form>
        </Fold>
      </Section>

      {type.source ? (
        <Section>
          <p className="text-[0.95rem] text-ink2">Source: <a href={type.source} target="_blank" rel="noopener noreferrer">{type.source}</a></p>
        </Section>
      ) : null}
    </div>
  );
}
