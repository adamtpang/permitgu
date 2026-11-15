import "server-only";
import catalog from "@/lib/catalog.generated.json";
import { agencyDirectory, type CatalogPermit } from "@/lib/catalog";
import { session } from "@/lib/session";

// The permit catalog, from the database when it is connected and the bundled
// list otherwise, plus one lookup for agency names.
export async function loadCatalog() {
  const current = await session();
  let permits = catalog.permits as CatalogPermit[];
  if (current.configured) {
    const { data } = await current.supabase
      .from("permit_catalog")
      .select("code, name, group_name, agency_label, agency_code, agency_codes, source, unverified, trackable");
    if (data?.length) {
      permits = data.map((row) => ({
        code: row.code,
        name: row.name,
        groupName: row.group_name,
        agencyLabel: row.agency_label,
        agencyCode: row.agency_code,
        agencyCodes: row.agency_codes?.length ? row.agency_codes : row.agency_code ? [row.agency_code] : [],
        source: row.source ?? "",
        unverified: row.unverified,
        trackable: row.trackable,
      }));
    }
  }
  return { permits, directory: agencyDirectory(catalog.agencies), agencyCount: catalog.agencies.length };
}
