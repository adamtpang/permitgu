import Link from "next/link";
import { ApplyForm } from "@/components/apply-form";
import { ActionCard, Glance, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { AgencyHub, StepsByPhase, stepFacts } from "@/components/steps-overview";
import { STEPS } from "@/lib/template";
import { session } from "@/lib/session";

export const metadata = { title: "Start a one-family building permit" };

export default async function ApplyPage() {
  const current = await session();
  const facts = stepFacts(STEPS);
  const signedIn = current.configured && current.user;
  return (
    <div>
      <PageHero
        eyebrow="Unofficial tracker"
        title="Build a house."
        lede="Track a one-family building permit from Public Works intake to your certificate of occupancy."
      >
        {current.configured && !current.user ? (
          <Link className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="/sign-in?next=/apply">
            Sign in to start
          </Link>
        ) : null}
        {signedIn ? (
          <a className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="#draft">
            Start your draft
          </a>
        ) : null}
        <a className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href="/build">
          Read the guide
        </a>
      </PageHero>
      {!current.configured ? <SetupNotice /> : null}

      <Section>
        <Glance
          facts={[
            { value: facts.every, label: "steps on every file" },
            { value: facts.sometimes, label: "more, only if a reviewer adds them" },
            { value: facts.agencies, label: "agencies that can be involved" },
            { value: "$0", label: "taken here. Fees are paid in person" },
          ]}
        />
      </Section>

      <Section title="Who touches it" lede="Public Works leads. Other agencies join when the file needs them.">
        <AgencyHub title="Agencies on a one-family building permit" lead="dpw" steps={STEPS} />
      </Section>

      {signedIn ? (
        <Section title="Start your draft" lede="Save it now and finish later. Nothing is sent until you submit.">
          <div id="draft" className="scroll-mt-6"><ApplyForm /></div>
        </Section>
      ) : null}

      <Section title="The steps" lede="Open a stage to see what happens in it.">
        <StepsByPhase steps={STEPS} />
      </Section>

      <Section title="Good to know">
        <ul className="grid max-w-[38rem] gap-4 text-lg text-ink2">
          <li>This is for a new house on public sewer. A septic tank, a wetland, or a shoreline lot follows the <a href="/clear-grade">clearing guide</a>.</li>
          <li>It does not replace the paper application. The owner still signs the official form.</li>
          <li>Which steps apply to every house is an assumption here, not a confirmed Public Works rule.</li>
        </ul>
      </Section>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply/business-license" label="Another permit" title="Open a business">A new general business license, tracked the same way.</ActionCard>
          <ActionCard href="/agencies" label="Agency map" title="Who touches what">Every cataloged permit and the agencies on it.</ActionCard>
        </div>
      </Section>
    </div>
  );
}
