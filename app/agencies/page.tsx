import Link from "next/link";
import { ActionCard, Bars, Fold, Glance, PageHero, Section } from "@/components/layout";
import { OpenOnHash } from "@/components/open-on-hash";
import { AgencyHub } from "@/components/steps-overview";
import { permitsByAgency } from "@/lib/catalog";
import { loadCatalog } from "@/lib/catalog-data";
import { LICENSE_STEPS } from "@/lib/license";
import { STEPS } from "@/lib/template";

export const metadata = { title: "Agency map" };

export default async function AgenciesPage() {
  const { permits, directory, agencyCount } = await loadCatalog();
  const rows = permitsByAgency(permits, directory);
  const shared = permits
    .filter((permit) => permit.agencyCodes.length > 1)
    .sort((a, b) => b.agencyCodes.length - a.agencyCodes.length || a.name.localeCompare(b.name));
  const busiest = rows.slice(0, 10);
  return (
    <div>
      <OpenOnHash />
      <PageHero
        eyebrow="Unofficial map"
        title="Who touches what."
        lede="One permit can pass through many agencies. This shows which ones, for every permit in the catalog."
      />

      <Section>
        <Glance
          facts={[
            { value: rows.length, label: `of ${agencyCount} agencies appear on a permit` },
            { value: shared.length, label: "permits cross agencies" },
            { value: shared[0]?.agencyCodes.length ?? 0, label: "agencies on the busiest permit" },
          ]}
        />
      </Section>

      <Section title="The two you can track" lede="The lead agency sits in the middle.">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h3 className="mb-4 text-center text-lg font-medium">One-family building permit</h3>
            <AgencyHub title="Agencies on a one-family building permit" lead="dpw" steps={STEPS} />
            <p className="mt-3 text-center"><Link href="/apply">Open the tracker</Link></p>
          </div>
          <div>
            <h3 className="mb-4 text-center text-lg font-medium">New business license</h3>
            <AgencyHub title="Agencies on a new business license" lead="drt" steps={LICENSE_STEPS} />
            <p className="mt-3 text-center"><Link href="/apply/business-license">Open the tracker</Link></p>
          </div>
        </div>
      </Section>

      <Section title="Busiest agencies" lede="Permits each one leads or signs off on.">
        <Bars rows={busiest.map((row) => ({ label: row.agency.name, value: row.lead.length + row.also.length, href: `#${row.agency.code}` }))} />
      </Section>

      <Section title="Permits that cross agencies">
        <Fold title="See all of them" note={`${shared.length}`}>
          <ul className="grid gap-4">
            {shared.map((permit) => (
              <li key={permit.code}>
                <span className="text-lg font-medium">{permit.name}</span>
                <p className="text-[0.95rem] text-ink2">
                  {permit.agencyCodes.map((code) => directory.get(code)?.acronym ?? code.toUpperCase()).join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Fold>
      </Section>

      <Section title="By agency" lede="The agency named first on a permit leads it. The others sign off.">
        {rows.map((row) => (
          <Fold key={row.agency.code} id={row.agency.code} title={row.agency.name} note={`${row.lead.length + row.also.length}`}>
            {row.lead.length ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-wider text-muted">Leads {row.lead.length}</p>
                <ul className="mt-2 grid gap-1.5 text-ink2">
                  {row.lead.map((permit) => <li key={permit.code}>{permit.name}</li>)}
                </ul>
              </>
            ) : null}
            {row.also.length ? (
              <>
                <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-muted">Also signs off on {row.also.length}</p>
                <ul className="mt-2 grid gap-1.5 text-ink2">
                  {row.also.map((permit) => <li key={permit.code}>{permit.name}</li>)}
                </ul>
              </>
            ) : null}
          </Fold>
        ))}
      </Section>

      <Section title="What this is not">
        <p className="max-w-[38rem] text-lg text-ink2">
          It comes from the agency named on each public page or application. It is not a complete legal list of clearances, and agencies that join only in special cases may be missing.
        </p>
      </Section>

      <Section>
        <ActionCard href="/permits" label="The same list, by goal" title="Every permit we could find">Browse permits by what you are trying to do.</ActionCard>
      </Section>
    </div>
  );
}
