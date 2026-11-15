import { Fold } from "@/components/layout";

export type OverviewStep = {
  code: string;
  name: string;
  agency: string;
  phase: string;
  routing: string;
  uncertainty: string | null;
};

const PHASES: { phase: string; label: string }[] = [
  { phase: "intake", label: "Intake" },
  { phase: "plan_review", label: "Plan review" },
  { phase: "clearance", label: "Clearances" },
  { phase: "fees", label: "Fees" },
  { phase: "issuance", label: "Issued" },
  { phase: "inspection", label: "Inspections" },
  { phase: "occupancy", label: "Occupancy" },
];

// Inspections are queued on every file. Their list is provisional, not optional.
const EVERY_FILE = new Set(["always", "default_routed", "provisional"]);

// The counts a person wants before starting: how many steps every file takes, how
// many more can be added, and how many agencies are involved.
export function stepFacts(steps: OverviewStep[]) {
  const every = steps.filter((step) => EVERY_FILE.has(step.routing));
  return {
    every: every.length,
    sometimes: steps.length - every.length,
    agencies: new Set(steps.map((step) => step.agency)).size,
    agenciesEvery: new Set(every.map((step) => step.agency)).size,
  };
}

// A picture of who touches a permit. The lead agency sits in the middle. Agencies on
// every file have a solid ring. Agencies that join only when routed have a dashed one.
export function AgencyHub({ title, lead, steps }: { title: string; lead: string; steps: OverviewStep[] }) {
  const order: string[] = [];
  const everyFile = new Set<string>();
  for (const step of steps) {
    if (!order.includes(step.agency)) order.push(step.agency);
    if (EVERY_FILE.has(step.routing)) everyFile.add(step.agency);
  }
  const others = order.filter((agency) => agency !== lead);
  const size = 380;
  const center = size / 2;
  const radius = 142;
  const always = others.filter((agency) => everyFile.has(agency));
  const routed = others.filter((agency) => !everyFile.has(agency));
  const summary = `${lead.toUpperCase()} leads. ${always.length ? `On every file: ${always.map((agency) => agency.toUpperCase()).join(", ")}. ` : ""}${routed.length ? `Only when routed: ${routed.map((agency) => agency.toUpperCase()).join(", ")}.` : ""}`;
  return (
    <figure className="mx-auto w-full max-w-[26rem]">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}. ${summary}`} className="h-auto w-full">
        {others.map((agency, index) => {
          const angle = (index / others.length) * Math.PI * 2 - Math.PI / 2;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          const solid = everyFile.has(agency);
          return (
            <g key={agency}>
              <line x1={center} y1={center} x2={x} y2={y} className={solid ? "stroke-ink2" : "stroke-line"} strokeWidth={solid ? 2 : 1.5} strokeDasharray={solid ? undefined : "4 5"} />
              <circle cx={x} cy={y} r={30} className={solid ? "fill-paper stroke-ink" : "fill-paper stroke-muted"} strokeWidth={solid ? 2 : 1.5} strokeDasharray={solid ? undefined : "4 4"} />
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-ink text-[12px] font-semibold uppercase">
                {agency}
              </text>
            </g>
          );
        })}
        <circle cx={center} cy={center} r={52} className="fill-ink" />
        <text x={center} y={center - 7} textAnchor="middle" dominantBaseline="central" className="fill-paper text-[17px] font-semibold uppercase">
          {lead}
        </text>
        <text x={center} y={center + 13} textAnchor="middle" dominantBaseline="central" className="fill-paper text-[11px]">
          leads
        </text>
      </svg>
      <figcaption className="mt-3 text-center text-sm text-ink2">
        Solid ring: on every file. Dashed ring: only when a reviewer routes it.
      </figcaption>
    </figure>
  );
}

// Every step, grouped by stage, one stage open at a time.
export function StepsByPhase({ steps }: { steps: OverviewStep[] }) {
  return (
    <div>
      {PHASES.filter((entry) => steps.some((step) => step.phase === entry.phase)).map((entry, index) => {
        const inPhase = steps.filter((step) => step.phase === entry.phase);
        return (
          <Fold key={entry.phase} title={entry.label} note={`${inPhase.length} ${inPhase.length === 1 ? "step" : "steps"}`} open={index === 0}>
            <ol className="grid gap-5">
              {inPhase.map((step) => (
                <li key={step.code}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-lg font-medium">{step.name}</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {step.agency} · {step.routing === "provisional" ? "list not confirmed" : EVERY_FILE.has(step.routing) ? "every file" : "when routed"}
                    </span>
                  </div>
                  {step.uncertainty ? <p className="mt-1 max-w-[38rem] text-[0.95rem] leading-relaxed text-ink2">{step.uncertainty}</p> : null}
                </li>
              ))}
            </ol>
          </Fold>
        );
      })}
    </div>
  );
}
