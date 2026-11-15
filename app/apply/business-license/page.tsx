import Link from "next/link";
import { LicenseForm } from "@/components/license-form";
import { SetupNotice } from "@/components/shell";
import { BL01_URL, BL_LAW_URL, BL_PROCEDURE_URL, LICENSE_STEPS } from "@/lib/license";
import { session } from "@/lib/session";

export const metadata = { title: "Start a business license" };

export default async function BusinessLicensePage() {
  const current = await session();
  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial tracker</p>
        <h1 className="mt-2 font-serif text-5xl font-normal tracking-tight text-ink sm:text-6xl">New business license</h1>
        <p className="mt-4 text-lg text-ink2">
          This follows a new general business license through the Department of Revenue and Taxation and the agencies
          that clear it. It is not the paper application, and it does not take a fee. Renewals, liquor, tobacco, and
          professional licenses are not in this flow.
        </p>
        <p className="mt-3 text-sm text-ink2">
          Sources: <a href={BL01_URL} target="_blank" rel="noopener noreferrer">Form BL-01</a>,{" "}
          <a href={BL_PROCEDURE_URL} target="_blank" rel="noopener noreferrer">the procedure for a new license</a>, and{" "}
          <a href={BL_LAW_URL} target="_blank" rel="noopener noreferrer">11 GCA Chapter 70</a>. Looking for the house permit?{" "}
          <Link href="/apply">Start a building permit</Link>.
        </p>
      </header>
      {!current.configured ? <SetupNotice /> : null}
      {current.configured && !current.user ? (
        <p className="text-ink2">
          <Link href="/sign-in?next=/apply/business-license">Sign in with your email</Link> to save a draft. No password.
        </p>
      ) : null}
      {current.configured && current.user ? <LicenseForm /> : null}
      <section>
        <h2 className="font-serif text-3xl font-normal">Steps on this template</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink2">
          The three tax clearances are required by law for every license. The zoning clearance is assumed for a new
          license. The other agencies are boxes on Form BL-01 that Revenue and Taxation ticks when they apply, so they
          stay off until a reviewer routes them.
        </p>
        <ol className="mt-4 grid gap-3">
          {LICENSE_STEPS.map((step) => (
            <li key={step.code} className="rounded-2xl border border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{step.name}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{step.agency} · {step.routing.replaceAll("_", " ")}</span>
              </div>
              {step.uncertainty ? <p className="mt-1 text-sm text-ink2">{step.uncertainty}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
