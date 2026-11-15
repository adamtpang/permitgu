import Link from "next/link";
import { formAgencies, groupPermits } from "@/lib/catalog";
import { loadCatalog } from "@/lib/catalog-data";

export const metadata = { title: "Permit catalog" };

export default async function PermitsPage() {
  const { permits, directory, agencyCount } = await loadCatalog();
  const sections = groupPermits(permits);
  const shared = permits.filter((permit) => permit.agencyCodes.length > 1).length;
  return (
    <div className="grid gap-8">
      <header className="max-w-3xl">
        <p className="text-sm uppercase tracking-wide text-muted">Unofficial catalog</p>
        <h1 className="mt-2 font-serif text-5xl font-normal">Agencies and permits</h1>
        <p className="mt-4 text-lg text-ink2">
          {agencyCount} agencies and {permits.length} named permits from the public lists. {shared} of them name more than one agency. Two are working trackers: the one-family building permit and the new business license. The rest are a catalog so another permit can be added in the admin page without a code change. Unconfirmed rows stay marked.
        </p>
        <p className="mt-3"><Link href="/agencies">See the same list by agency</Link></p>
      </header>
      {sections.map((section) => (
        <section key={section.groupName} className="grid gap-3">
          <h2 className="font-serif text-3xl font-normal">{section.groupName}</h2>
          <ul className="grid gap-2">
            {section.items.map((item) => (
              <li key={item.code} className="rounded-2xl border border-line px-4 py-3">
                <span className="font-medium">{item.name}</span>
                <p className="text-sm text-ink2">{item.agencyLabel}</p>
                {item.agencyCodes.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Agencies involved in ${item.name}`}>
                    {item.agencyCodes.map((code) => {
                      const agency = directory.get(code);
                      return (
                        <li key={code}>
                          <Link
                            href={`/agencies#${code}`}
                            title={agency?.name ?? code}
                            className="inline-block rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink2 no-underline hover:bg-soft"
                          >
                            {agency?.acronym ?? code.toUpperCase()}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {item.agencyCodes.length > 1 ? (
                  <p className="mt-1 text-sm text-ink2">
                    Touches {item.agencyCodes.length} agencies{item.trackable ? ". Some join only when a reviewer routes them." : "."}
                  </p>
                ) : null}
                {formAgencies(item.code) ? (
                  <p className="mt-1 text-sm text-ink2">
                    {formAgencies(item.code)!.note}{" "}
                    <a href={formAgencies(item.code)!.source} target="_blank" rel="noopener noreferrer">Form BL-01</a>
                  </p>
                ) : null}
                {item.unverified ? <p className="text-sm text-ink2">Not yet confirmed from a single official page.</p> : null}
                {item.trackable ? <p className="mt-1 text-sm"><Link href={formAgencies(item.code) ? "/apply/business-license" : "/apply"}>Open the tracker</Link></p> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
