import Link from "next/link";
import { addPermit, grantMembership, retireSampleFiles, revokeMembership, updateTypeStep } from "@/lib/actions";
import { InviteForm } from "@/components/invite-form";
import { ActionCard, ErrorNotice, Fold, Glance, Notice, PageHero, Section } from "@/components/layout";
import { SetupNotice } from "@/components/shell";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { noticeText } from "@/lib/notices";
import { OPEN_QUESTIONS, STEPS } from "@/lib/template";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Admin" };

const HOUSE = "building_permit_residential_one_family";
const ROUTING_LABEL: Record<string, string> = {
  always: "Every file",
  default_routed: "Every file, assumed (not confirmed)",
  as_indicated: "Only when a reviewer adds it",
  gated: "Only after an earlier step",
  provisional: "Every file, list not confirmed",
};
const FIXED_PHASES = ["intake", "fees", "issuance", "occupancy"];
const ERRORS: Record<string, string> = {
  fixed_step: "Intake, fee, and issue steps run on every file. Only the note can change.",
  bad_routing: "That choice is not available for this permit.",
  not_authorized: "Only a super admin can change this.",
  too_long: "The note is too long. Keep it under 600 characters.",
};
const select = "w-full rounded-2xl border border-line bg-paper px-4 py-3";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) {
    return (
      <div>
        <PageHero eyebrow="Staff" title="Admin." lede="The database is not connected, so only the bundled template is shown." />
        <SetupNotice />
        <Section title="Template, from the public record">
          <ul className="grid gap-3">
            {STEPS.map((step) => (
              <li key={step.code}>
                <span className="font-medium">{step.name}</span>
                <span className="text-muted"> · {ROUTING_LABEL[step.routing] ?? step.routing}</span>
                {step.uncertainty ? <p className="mt-1 max-w-[38rem] text-[0.95rem] text-ink2">{step.uncertainty}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
        <QuestionList />
      </div>
    );
  }
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (!("staff" in current) || current.aal !== "aal2" || !current.staff.length) return <p>Admin tools need a staff role and an authenticator app.</p>;

  const agencies = await current.supabase.from("agencies").select("id, code, acronym, name").order("name");
  const steps = await current.supabase
    .from("workflow_steps")
    .select("code, name, phase, routing, uncertainty, sort_order, agencies(acronym), application_types(code, name, builder, active)")
    .order("sort_order");
  const members = await current.supabase.from("memberships").select("id, role, profiles(full_name, email), agencies(acronym)").neq("role", "citizen");

  const { count: sampleCount } = await current.supabase.from("applications").select("id", { count: "exact", head: true }).eq("is_sample", true).eq("is_test", false);

  // Steps grouped by the permit they belong to, built-in permits first.
  type TypeInfo = { code: string; name: string; builder: boolean; active: boolean };
  const groups = new Map<string, { type: TypeInfo; steps: NonNullable<typeof steps.data> }>();
  for (const step of steps.data ?? []) {
    const type = one<TypeInfo>(step.application_types as TypeInfo | TypeInfo[] | null);
    if (!type) continue;
    if (!groups.has(type.code)) groups.set(type.code, { type, steps: [] });
    groups.get(type.code)!.steps.push(step);
  }
  const permits = [...groups.values()].sort((a, b) => Number(a.type.builder) - Number(b.type.builder) || a.type.name.localeCompare(b.type.name));
  const error = query.error ? ERRORS[query.error.split(":")[0].trim()] ?? query.error : undefined;

  return (
    <div>
      <PageHero eyebrow="Staff" title="Admin." lede="Permits, their steps, and who can review them." />
      <Notice text={noticeText(query.done)} />
      <ErrorNotice text={error} />

      <Section>
        <Glance
          facts={[
            { value: permits.length, label: "tracked permits" },
            { value: (steps.data ?? []).length, label: "steps across them" },
            { value: (members.data ?? []).length, label: (members.data ?? []).length === 1 ? "staff role" : "staff roles" },
            { value: (agencies.data ?? []).length, label: "agencies listed" },
          ]}
        />
      </Section>

      {current.isSuper ? (
        <Section>
          <div className="grid gap-4 sm:grid-cols-3">
            <ActionCard href="/admin/permits" label="No code change" title="Permit builder">Add a permit people can track.</ActionCard>
            <ActionCard href="/admin/contributions" label="From the public" title="Corrections">Read what people sent in.</ActionCard>
            <ActionCard href="/admin/audit" label="Every action" title="Audit log">Search and export the record.</ActionCard>
          </div>
        </Section>
      ) : null}

      <Section title="Steps" lede="Changing a step changes what this demo queues. It does not create a legal requirement. Keep the note honest when a step is not confirmed.">
        {permits.map(({ type, steps: list }) => (
          <Fold key={type.code} title={type.name} note={`${list.length} ${list.length === 1 ? "step" : "steps"}${type.builder && !type.active ? " · off" : ""}`}>
            {type.builder && current.isSuper ? (
              <p className="mb-5 text-[0.95rem] text-ink2">
                Add or remove steps, questions, and papers in the <Link href={`/admin/permits/${type.code}`}>permit builder</Link>.
              </p>
            ) : null}
            <ul className="grid gap-6">
              {list.map((step) => {
                const fixed = FIXED_PHASES.includes(step.phase);
                const choices = type.code === HOUSE ? ["always", "default_routed", "as_indicated", "gated", "provisional"] : ["always", "default_routed", "as_indicated"];
                const id = `${type.code}-${step.code}`;
                return (
                  <li key={step.code}>
                    <p className="text-lg font-medium">{step.name}</p>
                    <p className="text-[0.95rem] text-muted">{one(step.agencies)?.acronym} · {ROUTING_LABEL[step.routing] ?? step.routing}</p>
                    {current.isSuper ? (
                      <form action={updateTypeStep} className="mt-3 grid max-w-2xl gap-3">
                        <input type="hidden" name="return_to" value="/admin" />
                        <input type="hidden" name="type_code" value={type.code} />
                        <input type="hidden" name="step_code" value={step.code} />
                        {fixed ? (
                          <input type="hidden" name="routing" value={step.routing} />
                        ) : (
                          <div>
                            <Label htmlFor={`routing-${id}`}>When it applies</Label>
                            <select id={`routing-${id}`} name="routing" defaultValue={step.routing} className={select}>
                              {choices.map((routing) => <option key={routing} value={routing}>{ROUTING_LABEL[routing]}</option>)}
                            </select>
                          </div>
                        )}
                        <div>
                          <Label htmlFor={`note-${id}`}>Note the applicant reads</Label>
                          <Textarea id={`note-${id}`} name="uncertainty" defaultValue={step.uncertainty ?? ""} rows={3} maxLength={600} />
                        </div>
                        <Button type="submit" variant="outline" className="min-h-[44px] w-fit px-5">Save step</Button>
                      </form>
                    ) : step.uncertainty ? (
                      <p className="mt-1 max-w-[38rem] text-[0.95rem] text-ink2">{step.uncertainty}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Fold>
        ))}
      </Section>

      <Section title="Staff" lede="A reviewer works one agency's steps. An agency admin also assigns them. A super admin sees everything.">
        <ul className="grid gap-3">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
              <span>
                <span className="font-medium">{one(member.profiles)?.full_name}</span>
                <span className="block break-all text-[0.95rem] text-muted">{one(member.profiles)?.email} · {member.role.replaceAll("_", " ")} · {one(member.agencies)?.acronym ?? "all agencies"}</span>
              </span>
              <form action={revokeMembership}>
                <input type="hidden" name="return_to" value="/admin" />
                <input type="hidden" name="membership_id" value={member.id} />
                <Button type="submit" variant="outline" className="min-h-[44px] px-5" aria-label={`Remove the role of ${one(member.profiles)?.full_name ?? "this person"}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <Fold title="Give a role to someone with an account">
          <form action={grantMembership} className="grid max-w-2xl gap-4">
            <input type="hidden" name="return_to" value="/admin" />
            <div>
              <Label htmlFor="grant-email">Their email</Label>
              <Input id="grant-email" name="email" type="email" required />
              <p className="mt-1 text-sm text-muted">They sign in once at the public sign-in page first, so the account exists.</p>
            </div>
            <div>
              <Label htmlFor="grant-role">Role</Label>
              <select id="grant-role" name="role" className={select}>
                <option value="reviewer">Reviewer</option>
                {current.isSuper ? <option value="agency_admin">Agency admin</option> : null}
                {current.isSuper ? <option value="super_admin">Super admin</option> : null}
              </select>
            </div>
            <div>
              <Label htmlFor="grant-agency">Agency</Label>
              <select id="grant-agency" name="agency_code" className={select}>
                <option value="">None (super admin only)</option>
                {(agencies.data ?? []).map((agency) => <option key={agency.code} value={agency.code}>{agency.name}</option>)}
              </select>
            </div>
            <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Give role</Button>
          </form>
        </Fold>
        {current.isSuper ? (
          <Fold title="Create a staff account">
            <InviteForm agencies={agencies.data ?? []} />
          </Fold>
        ) : null}
      </Section>

      {current.isSuper ? (
        <Section title="Catalog" lede="Add a permit to the public list. This writes a row. It does not invent a legal requirement.">
          <Fold title="Add a catalog permit">
            <form action={addPermit} className="grid max-w-2xl gap-4">
              <input type="hidden" name="return_to" value="/admin" />
              <div><Label htmlFor="cat-name">Permit name</Label><Input id="cat-name" name="name" required /></div>
              <div><Label htmlFor="cat-group">Group it belongs in</Label><Input id="cat-group" name="group_name" required /></div>
              <div><Label htmlFor="cat-label">Agency, as printed on the source</Label><Input id="cat-label" name="agency_label" /></div>
              <div>
                <Label htmlFor="cat-agency">Agency from the list (optional)</Label>
                <select id="cat-agency" name="agency_code" className={select}>
                  <option value="">Not on the list</option>
                  {(agencies.data ?? []).map((agency) => <option key={agency.code} value={agency.code}>{agency.name}</option>)}
                </select>
              </div>
              <div><Label htmlFor="cat-source">Official link</Label><Input id="cat-source" name="source" type="url" placeholder="https://" /></div>
              <label className="flex items-center gap-3 text-[0.95rem]"><input type="checkbox" name="unverified" defaultChecked /> Not yet confirmed</label>
              <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Add to catalog</Button>
            </form>
          </Fold>
        </Section>
      ) : null}

      {current.isSuper && sampleCount ? (
        <Section title="Sample data" lede={`${sampleCount} made-up sample files feed the time estimates and fill the queue, so the demo has something to show.`}>
          <Fold title="Stop using sample files">
            <form action={retireSampleFiles} className="grid max-w-2xl gap-3">
              <p className="text-[0.95rem] text-ink2">
                Do this when real files take over. The sample files stay in the record, marked as test files, and estimates stop counting them. Until real files finish, estimates will say there is not enough history. This cannot be undone from this page.
              </p>
              <Button type="submit" variant="outline" className="min-h-[48px] w-fit px-6 text-base">Stop using sample files</Button>
            </form>
          </Fold>
        </Section>
      ) : null}

      <QuestionList />
    </div>
  );
}

function QuestionList() {
  return (
    <Section title="Still open">
      <Fold title="Questions for the agencies" note={`${OPEN_QUESTIONS.length}`}>
        <ol className="grid max-w-[38rem] list-decimal gap-3 pl-5 text-ink2">
          {OPEN_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
        </ol>
      </Fold>
    </Section>
  );
}
