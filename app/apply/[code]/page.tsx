import Link from "next/link";
import { notFound } from "next/navigation";
import { BuiltForm } from "@/components/builder-form";
import { ActionCard, Glance, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { AgencyHub, StepsByPhase, stepFacts } from "@/components/steps-overview";
import { loadType } from "@/lib/permit-types";
import { session } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const current = await session();
  const type = current.configured ? await loadType(current.supabase, { code }) : null;
  return { title: type?.builder && type.active ? `Start: ${type.name}` : "Start a permit" };
}

// A permit defined in the admin page. Its steps, questions, and papers come from the database.
export default async function BuiltApplyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const current = await session();
  if (!current.configured) return <SetupNotice />;
  const type = await loadType(current.supabase, { code });
  if (!type || !type.builder || !type.active) notFound();
  const facts = stepFacts(type.steps);
  const signedIn = Boolean(current.user);
  const required = type.documents.length;
  return (
    <div>
      <PageHero eyebrow="Unofficial tracker" title={`${type.name}.`} lede={type.summary || `Track this ${type.noun} from ${type.lead.name} intake to the day it is issued.`}>
        {signedIn ? (
          <a className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="#draft">
            Start your draft
          </a>
        ) : (
          <Link className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href={`/sign-in?next=/apply/${type.code}`}>
            Sign in to start
          </Link>
        )}
        {type.source ? (
          <a className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href={type.source} target="_blank" rel="noopener noreferrer">
            Official source
          </a>
        ) : null}
      </PageHero>

      <Section>
        <Glance
          facts={[
            { value: facts.every, label: "steps on every file" },
            { value: facts.sometimes, label: "more, only if a reviewer adds them" },
            { value: facts.agencies, label: facts.agencies === 1 ? "agency involved" : "agencies that can be involved" },
            { value: "$0", label: "taken here. Fees are paid in person" },
          ]}
        />
      </Section>

      <Section title="Who touches it" lede={`${type.lead.name} leads and sends the file to each agency that has to clear it.`}>
        <AgencyHub title={`Agencies on: ${type.name}`} lead={type.lead.code} steps={type.steps} />
      </Section>

      {signedIn ? (
        <Section title="Start your draft" lede="Save it now and finish later. Nothing is sent until you submit.">
          <div id="draft" className="scroll-mt-6"><BuiltForm code={type.code} fields={type.fields} noun={type.noun} /></div>
        </Section>
      ) : null}

      <Section title="The steps" lede="Open a stage to see what happens in it.">
        <StepsByPhase steps={type.steps} />
      </Section>

      <Section title="Good to know">
        <ul className="grid max-w-[38rem] gap-4 text-lg text-ink2">
          <li>This tracker does not replace the agency&apos;s own application. The applicant still files and signs the official one.</li>
          {required ? (
            <li>
              You upload {required === 1 ? "one paper" : `${required} papers`} before you submit: {type.documents.map((document) => document.name).join(", ")}.
            </li>
          ) : null}
          <li>The steps here were entered by a PermitGU admin from the public record. They are not confirmed by {type.lead.name}.</li>
          {type.source ? (
            <li>Source: <a href={type.source} target="_blank" rel="noopener noreferrer">the official page this was built from</a>.</li>
          ) : null}
        </ul>
      </Section>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply" label="Another permit" title="Build a house">A one-family building permit, tracked the same way.</ActionCard>
          <ActionCard href="/apply/business-license" label="Another permit" title="Open a business">A new general business license, tracked the same way.</ActionCard>
        </div>
      </Section>
    </div>
  );
}
