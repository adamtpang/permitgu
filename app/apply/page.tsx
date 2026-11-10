import Link from "next/link";
import { ApplyForm } from "@/components/apply-form";
import { SetupNotice } from "@/components/shell";
import { STEPS } from "@/lib/template";
import { session } from "@/lib/session";

export const metadata = { title: "Start a one-family building permit" };

export default async function ApplyPage() {
  const current = await session();
  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial tracker</p>
        <h1 className="mt-2 font-serif text-5xl font-normal tracking-tight text-ink sm:text-6xl">
          Private one-family building permit
        </h1>
        <p className="mt-4 text-lg text-ink2">
          This follows a new house on public sewer through DPW. It is not the paper application, and it does not
          take a fee. Septic, wetland, and seashore paths stay on the{" "}
          <Link href="/clear-grade">clearing guide</Link> and the <Link href="/build">building guide</Link>.
        </p>
      </header>
      {!current.configured ? <SetupNotice /> : null}
      {current.configured && !current.user ? (
        <p className="text-ink2">
          <Link href="/sign-in?next=/apply">Sign in with your email</Link> to save a draft. No password.
        </p>
      ) : null}
      {current.configured && current.user ? <ApplyForm /> : <StepPreview />}
    </div>
  );
}

function StepPreview() {
  return (
    <section>
      <h2 className="font-serif text-3xl font-normal">Steps on this template</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink2">
        Default-routed steps are an assumption for a sewered one-family house, not a confirmed DPW rule. As-indicated
        steps stay off until a DPW reviewer routes them.
      </p>
      <ol className="mt-4 grid gap-3">
        {STEPS.map((step) => (
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
  );
}
