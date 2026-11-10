import Link from "next/link";
import catalog from "@/lib/catalog.generated.json";
import { groupPermits, type CatalogPermit } from "@/lib/catalog";
import { session } from "@/lib/session";

export const metadata = { title: "Permit catalog" };

export default async function PermitsPage() {
  const current = await session();
  let permits = catalog.permits as CatalogPermit[];
  if (current.configured) {
    const { data } = await current.supabase.from("permit_catalog").select("code, name, group_name, agency_label, agency_code, source, unverified, trackable");
    if (data?.length) {
      permits = data.map((row) => ({
        code: row.code,
        name: row.name,
        groupName: row.group_name,
        agencyLabel: row.agency_label,
        agencyCode: row.agency_code,
        source: row.source ?? "",
        unverified: row.unverified,
        trackable: row.trackable,
      }));
    }
  }
  const sections = groupPermits(permits);
  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial catalog</p>
        <h1 className="mt-2 font-serif text-5xl font-normal">Agencies and permits</h1>
        <p className="mt-4 text-lg text-ink2">
          {catalog.agencies.length} agencies and {permits.length} named permits from the public lists. Only the one-family building permit is a working tracker. The rest are a catalog so another permit can be added in the admin page without a code change. Unconfirmed rows stay marked.
        </p>
      </header>
      {sections.map((section) => (
        <section key={section.groupName} className="grid gap-3">
          <h2 className="font-serif text-3xl font-normal">{section.groupName}</h2>
          <ul className="grid gap-2">
            {section.items.map((item) => (
              <li key={item.code} className="rounded-2xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs uppercase tracking-wide text-muted">{item.agencyCode ?? item.agencyLabel}</span>
                </div>
                <p className="text-sm text-ink2">{item.agencyLabel}</p>
                {item.unverified ? <p className="text-sm text-ink2">Not yet confirmed from a single official page.</p> : null}
                {item.trackable ? <p className="mt-1 text-sm"><Link href="/apply">Open the tracker</Link></p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
