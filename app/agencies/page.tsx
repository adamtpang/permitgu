import Link from "next/link";
import { permitsByAgency } from "@/lib/catalog";
import { loadCatalog } from "@/lib/catalog-data";

export const metadata = { title: "Agency map" };

export default async function AgenciesPage() {
  const { permits, directory, agencyCount } = await loadCatalog();
  const rows = permitsByAgency(permits, directory);
  const shared = permits
    .filter((permit) => permit.agencyCodes.length > 1)
    .sort((a, b) => b.agencyCodes.length - a.agencyCodes.length || a.name.localeCompare(b.name));
  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial map</p>
        <h1 className="mt-2 font-serif text-5xl font-normal">Who touches what</h1>
        <p className="mt-4 text-lg text-ink2">
          {rows.length} of the {agencyCount} listed agencies appear on at least one of the {permits.length} cataloged permits. {shared.length} permits involve more than one agency. The agency named first leads the permit. The others sign off on it.
        </p>
        <p className="mt-3 text-sm text-ink2">
          This comes from the agency named on each public form and page. It is not a complete legal list of clearances. Agencies that join only in special cases may be missing.
        </p>
        <p className="mt-3"><Link href="/permits">See the same list by permit</Link></p>
      </header>

      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Permits that cross agencies</h2>
        <ul className="grid gap-2">
          {shared.map((permit) => (
            <li key={permit.code} className="rounded-2xl border border-line px-4 py-3">
              <span className="font-medium">{permit.name}</span>
              <p className="text-sm text-ink2">
                {permit.agencyCodes.length} agencies: {permit.agencyCodes.map((code) => directory.get(code)?.acronym ?? code.toUpperCase()).join(", ")}
              </p>
              {permit.trackable ? <p className="mt-1 text-sm"><Link href={permit.code.startsWith("new-business-license") ? "/apply/business-license" : "/apply"}>Open the tracker</Link></p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">By agency</h2>
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.agency.code} id={row.agency.code} className="scroll-mt-6 rounded-2xl border border-line px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{row.agency.name}</span>
                <span className="text-xs uppercase tracking-wide text-muted">{row.agency.acronym}</span>
              </div>
              {row.lead.length ? (
                <>
                  <p className="mt-2 text-sm text-muted">Leads {row.lead.length}</p>
                  <ul className="mt-1 grid gap-0.5 text-sm text-ink2">
                    {row.lead.map((permit) => <li key={permit.code}>{permit.name}</li>)}
                  </ul>
                </>
              ) : null}
              {row.also.length ? (
                <>
                  <p className="mt-2 text-sm text-muted">Also signs off on {row.also.length}</p>
                  <ul className="mt-1 grid gap-0.5 text-sm text-ink2">
                    {row.also.map((permit) => <li key={permit.code}>{permit.name}</li>)}
                  </ul>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
