import Link from "next/link";
import { ActionCard, Glance, PageHero, Section } from "@/components/layout";
import { LicenseForm } from "@/components/license-form";
import { SetupNotice } from "@/components/shell";
import { AgencyHub, StepsByPhase, stepFacts } from "@/components/steps-overview";
import { BL01_URL, BL_LAW_URL, BL_PROCEDURE_URL, LICENSE_STEPS } from "@/lib/license";
import { session } from "@/lib/session";

export const metadata = { title: "Start a business license" };

export default async function BusinessLicensePage() {
  const current = await session();
  const facts = stepFacts(LICENSE_STEPS);
  const signedIn = current.configured && current.user;
  return (
    <div>
      <PageHero
        eyebrow="Unofficial tracker"
        title="Open a business."
        lede="Track a new general business license from Revenue and Taxation intake to the day it is issued."
      >
        {current.configured && !current.user ? (
          <Link className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="/sign-in?next=/apply/business-license">
            Sign in to start
          </Link>
        ) : null}
        {signedIn ? (
          <a className="inline-flex min-h-[52px] items-center rounded-full bg-ink px-6 text-lg font-medium text-paper no-underline" href="#draft">
            Start your draft
          </a>
        ) : null}
        <a className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href={BL01_URL} target="_blank" rel="noopener noreferrer">
          See Form BL-01
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

      <Section title="Who touches it" lede="Revenue and Taxation leads and sends the file to each agency that has to clear it.">
        <AgencyHub title="Agencies on a new business license" lead="drt" steps={LICENSE_STEPS} />
      </Section>

      {signedIn ? (
        <Section title="Start your draft" lede="Save it now and finish later. Nothing is sent until you submit.">
          <div id="draft" className="scroll-mt-6"><LicenseForm /></div>
        </Section>
      ) : null}

      <Section title="The steps" lede="Open a stage to see what happens in it.">
        <StepsByPhase steps={LICENSE_STEPS} typeCode="business_license_new" />
      </Section>

      <Section title="Good to know">
        <ul className="grid max-w-[38rem] gap-4 text-lg text-ink2">
          <li>The three tax clearances are required by law for every license.</li>
          <li>Eight agencies are boxes on Form BL-01. Revenue and Taxation ticks the ones that apply, and no public list says which business needs which.</li>
          <li>Renewals, liquor, tobacco, and professional licenses are not in this flow.</li>
          <li>
            Sources: <a href={BL01_URL} target="_blank" rel="noopener noreferrer">Form BL-01</a>,{" "}
            <a href={BL_PROCEDURE_URL} target="_blank" rel="noopener noreferrer">the procedure for a new license</a>, and{" "}
            <a href={BL_LAW_URL} target="_blank" rel="noopener noreferrer">11 GCA Chapter 70</a>.
          </li>
        </ul>
      </Section>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply" label="Another permit" title="Build a house">A one-family building permit, tracked the same way.</ActionCard>
          <ActionCard href="/agencies" label="Agency map" title="Who touches what">Every cataloged permit and the agencies on it.</ActionCard>
        </div>
      </Section>
    </div>
  );
}
