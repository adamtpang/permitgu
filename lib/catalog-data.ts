import "server-only";
import catalog from "@/lib/catalog.generated.json";
import { agencyDirectory, trackerPath, type CatalogPermit } from "@/lib/catalog";
import { listBuiltTypes } from "@/lib/permit-types";
import { session } from "@/lib/session";

// The bundled list knows only the two built-in trackers.
const BUNDLED_TRACKERS: Record<string, string> = {
  "new-business-license-form-bl-01": "business_license_new",
};

// The permit catalog, from the database when it is connected and the bundled
// list otherwise, plus one lookup for agency names and the permits built in the admin page.
export async function loadCatalog() {
  const current = await session();
  let permits = (catalog.permits as CatalogPermit[]).map((permit) => ({
    ...permit,
    trackerPath: permit.trackable ? trackerPath(BUNDLED_TRACKERS[permit.code] ?? "building_permit_residential_one_family") : undefined,
  }));
  let built: Awaited<ReturnType<typeof listBuiltTypes>> = [];
  if (current.configured) {
    built = await listBuiltTypes(current.supabase, { activeOnly: true });
    const live = new Set(built.map((type) => type.code));
    const { data } = await current.supabase
      .from("permit_catalog")
      .select("code, name, group_name, agency_label, agency_code, agency_codes, source, unverified, trackable, application_type_code");
    if (data?.length) {
      permits = data.map((row) => {
        // A built permit that is switched off is not offered.
        const open = row.trackable && (!row.application_type_code?.startsWith("x_") || live.has(row.application_type_code));
        return {
          code: row.code,
          name: row.name,
          groupName: row.group_name,
          agencyLabel: row.agency_label,
          agencyCode: row.agency_code,
          agencyCodes: row.agency_codes?.length ? row.agency_codes : row.agency_code ? [row.agency_code] : [],
          source: row.source ?? "",
          unverified: row.unverified,
          trackable: Boolean(open),
          trackerPath: open ? trackerPath(row.application_type_code) : undefined,
        };
      });
    }
  }
  return { permits, built, directory: agencyDirectory(catalog.agencies), agencyCount: catalog.agencies.length };
}
