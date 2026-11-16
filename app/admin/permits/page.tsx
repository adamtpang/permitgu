import Link from "next/link";
import { createPermitType } from "@/lib/actions";
import { ErrorNotice, Notice, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { noticeText } from "@/lib/notices";
import { listBuiltTypes, NOUNS } from "@/lib/permit-types";
import { staffSession } from "@/lib/session";

export const metadata = { title: "Permit builder" };

export default async function PermitBuilderPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) return <SetupNotice />;
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (!("isSuper" in current) || current.aal !== "aal2" || !current.isSuper) return <p>The permit builder needs a super admin and an authenticator app.</p>;

  const types = await listBuiltTypes(current.supabase, { activeOnly: false });
  const { data: agencies } = await current.supabase.from("agencies").select("code, acronym, name").order("name");

  return (
    <div>
      <PageHero
        eyebrow="Admin"
        title="Permit builder."
        lede="Add a permit people can track here. You set its steps, its questions, and its papers. No code change."
      >
        <Link className="inline-flex min-h-[52px] items-center rounded-full border border-line px-6 text-lg no-underline" href="/admin">Back to admin</Link>
      </PageHero>
      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={query.error} />

      <Section title="Built permits" lede={types.length ? undefined : "None yet. The house permit and the business license are built in and are not edited here."}>
        <ul className="grid gap-4">
          {types.map((type) => (
            <li key={type.code}>
              <Link className="block rounded-[32px] border border-line p-6 text-ink no-underline transition hover:border-ink2" href={`/admin/permits/${type.code}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">{type.lead.name} leads · {type.active ? "On" : "Off"}</span>
                <span className="mt-2 block font-serif text-[clamp(1.7rem,3.6vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">{type.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Add a permit" lede="It starts switched off, with intake, fee, and issue steps for the lead agency. Add the rest on the next screen.">
        <form action={createPermitType} className="grid max-w-2xl gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required minLength={3} maxLength={120} placeholder="Sanitary permit for a food establishment" />
          </div>
          <div>
            <Label htmlFor="noun">What is issued</Label>
            <select id="noun" name="noun" className="w-full rounded-2xl border border-line bg-paper px-4 py-3">
              {NOUNS.map((noun) => <option key={noun} value={noun}>{noun}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="lead_agency_code">Lead agency</Label>
            <select id="lead_agency_code" name="lead_agency_code" className="w-full rounded-2xl border border-line bg-paper px-4 py-3">
              {(agencies ?? []).map((agency) => <option key={agency.code} value={agency.code}>{agency.name} ({agency.acronym})</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="summary">One or two sentences for the applicant</Label>
            <Textarea id="summary" name="summary" rows={3} maxLength={600} />
          </div>
          <div>
            <Label htmlFor="source">Official source link</Label>
            <Input id="source" name="source" type="url" placeholder="https://" />
            <p className="mt-1 text-sm text-muted">The agency page or law the steps come from. A permit cannot be switched on without one.</p>
          </div>
          <Button type="submit" variant="gu" className="min-h-[52px] w-fit px-7 text-lg">Create permit</Button>
        </form>
      </Section>
    </div>
  );
}
