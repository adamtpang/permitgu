import Link from "next/link";
import { ActionCard, Fold, Glance, PageHero, Section } from "@/components/layout";
import { formAgencies, groupPermits } from "@/lib/catalog";
import { loadCatalog } from "@/lib/catalog-data";

export const metadata = { title: "Permit catalog" };

export default async function PermitsPage() {
  const { permits, built, directory, agencyCount } = await loadCatalog();
  const sections = groupPermits(permits);
  const shared = permits.filter((permit) => permit.agencyCodes.length > 1).length;
  const tracked = permits.filter((permit) => permit.trackable).length;
  return (
    <div>
      <PageHero
        eyebrow="Unofficial catalog"
        title="Every permit we could find."
        lede="Named permits, licenses, and clearances from Guam's public agency pages, grouped by what you are trying to do."
      />

      <Section>
        <Glance
          facts={[
            { value: permits.length, label: "permits and licenses" },
            { value: agencyCount, label: "agencies listed" },
            { value: shared, label: "touch more than one agency" },
            { value: tracked, label: "you can track here today" },
          ]}
        />
      </Section>

      <Section title="Track one now">
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard href="/apply" label="Public Works leads" title="Build a house">A one-family building permit, step by step.</ActionCard>
          <ActionCard href="/apply/business-license" label="Revenue and Taxation leads" title="Open a business">A new general business license, step by step.</ActionCard>
          {built.map((type) => (
            <ActionCard key={type.code} href={`/apply/${type.code}`} label={`${type.lead.name} leads`} title={type.name}>
              Track this {type.noun}, step by step.
            </ActionCard>
          ))}
        </div>
      </Section>

      <Section title="Browse by goal" lede="Open a group to see what is in it. The rest are listed so they can be added later.">
        {sections.map((section) => (
          <Fold key={section.groupName} title={section.groupName.replace(/^\d+\.\s*/, "")} note={`${section.items.length}`}>
            <ul className="grid gap-5">
              {section.items.map((item) => (
                <li key={item.code}>
                  <span className="text-lg font-medium">{item.name}</span>
                  {item.agencyCodes.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Agencies involved in ${item.name}`}>
                      {item.agencyCodes.map((code) => {
                        const agency = directory.get(code);
                        return (
                          <li key={code}>
                            <Link
                              href={`/agencies#${code}`}
                              title={agency?.name ?? code}
                              className="inline-flex min-h-[32px] items-center rounded-full border border-line px-3 text-xs font-semibold uppercase tracking-wide text-ink2 no-underline hover:bg-soft"
                            >
                              {agency?.acronym ?? code.toUpperCase()}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[0.95rem] text-ink2">{item.agencyLabel}</p>
                  )}
                  {formAgencies(item.code) ? (
                    <p className="mt-2 max-w-[38rem] text-[0.95rem] text-ink2">
                      {formAgencies(item.code)!.note}{" "}
                      <a href={formAgencies(item.code)!.source} target="_blank" rel="noopener noreferrer">Form BL-01</a>
                    </p>
                  ) : null}
                  {item.unverified ? <p className="mt-1 text-[0.95rem] text-ink2">Not yet confirmed from a single official page.</p> : null}
                  {item.trackable ? (
                    <p className="mt-2">
                      <Link href={item.trackerPath ?? "/apply"}>Open the tracker</Link>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Fold>
        ))}
      </Section>

      <Section>
        <ActionCard href="/agencies" label="The same list, turned around" title="Who touches what">See each agency and the permits it leads or signs off on.</ActionCard>
      </Section>
    </div>
  );
}
