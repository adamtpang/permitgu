import Link from "next/link";
import { addPermit, grantMembership, revokeMembership, updateWorkflow } from "@/lib/actions";
import { InviteForm } from "@/components/invite-form";
import { SetupNotice } from "@/components/shell";
import { Button, Input, Textarea } from "@/components/ui";
import { OPEN_QUESTIONS, STEPS } from "@/lib/template";
import { one, staffSession } from "@/lib/session";

export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const query = await searchParams;
  const current = await staffSession();
  if (!current.configured) {
    return (
      <div className="grid gap-6">
        <h1 className="font-serif text-5xl font-normal">Admin</h1>
        <SetupNotice />
        <QuestionList />
        <TemplateList />
      </div>
    );
  }
  if (!("user" in current) || !current.user) return <p><Link href="/staff/sign-in">Staff sign-in</Link></p>;
  if (current.aal !== "aal2" || !current.staff.length) return <p>Admin tools need a staff role and an authenticator app.</p>;

  const agencies = await current.supabase.from("agencies").select("id, code, acronym, name").order("acronym");
  const steps = await current.supabase.from("workflow_steps").select("code, name, routing, uncertainty, sort_order, agencies(acronym)").order("sort_order");
  const members = await current.supabase.from("memberships").select("id, role, profiles(full_name, email), agencies(acronym)").neq("role", "citizen");
  const audit = current.isSuper
    ? await current.supabase.from("audit_log").select("id, action, memo, created_at, visibility").order("id", { ascending: false }).limit(25)
    : { data: [] };

  return (
    <div className="grid gap-8">
      <h1 className="font-serif text-5xl font-normal">Admin</h1>
      {query.error ? <p className="text-sm text-bad" role="alert">{query.error}</p> : null}
      {query.notice ? <p className="text-sm text-ink2" role="status">{query.notice}</p> : null}
      <p className="max-w-2xl text-ink2">
        Routing changes what this demo queues. They do not create a new legal requirement. Keep the uncertainty note when a step is still unconfirmed.
        {current.isSuper ? <> <Link href="/admin/audit">Open the audit log</Link>.</> : null}
      </p>
      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Workflow template</h2>
        <ul className="grid gap-3">
          {(steps.data ?? []).map((step) => (
            <li key={step.code} className="rounded-2xl border border-line p-4">
              <p className="font-medium">{one(step.agencies)?.acronym} · {step.name}</p>
              <p className="text-sm text-muted">Routing: {step.routing.replaceAll("_", " ")}</p>
              {step.uncertainty ? <p className="mt-1 text-sm text-ink2">{step.uncertainty}</p> : null}
              {current.isSuper ? (
                <form action={updateWorkflow} className="mt-3 grid gap-2">
                  <input type="hidden" name="return_to" value="/admin" />
                  <input type="hidden" name="code" value={step.code} />
                  <select name="routing" defaultValue={step.routing} className="rounded-2xl border border-line bg-paper px-3 py-2" aria-label={`Routing for ${step.name}`}>
                    {["always", "default_routed", "as_indicated", "gated", "provisional"].map((routing) => <option key={routing}>{routing}</option>)}
                  </select>
                  <Textarea name="uncertainty" defaultValue={step.uncertainty ?? ""} rows={2} aria-label={`Uncertainty for ${step.name}`} />
                  <Button type="submit" variant="outline">Save routing</Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3">
        <h2 className="font-serif text-3xl font-normal">Staff</h2>
        <ul className="grid gap-2 text-sm">
          {(members.data ?? []).map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-4 py-3">
              <span>{one(member.profiles)?.full_name} · {one(member.profiles)?.email} · {member.role} · {one(member.agencies)?.acronym ?? "all"}</span>
              <form action={revokeMembership}>
                <input type="hidden" name="return_to" value="/admin" />
                <input type="hidden" name="membership_id" value={member.id} />
                <Button type="submit" variant="outline">Remove</Button>
              </form>
            </li>
          ))}
        </ul>
        <form action={grantMembership} className="grid max-w-md gap-2">
          <input type="hidden" name="return_to" value="/admin" />
          <Input name="email" type="email" required placeholder="Existing user email" aria-label="Existing user email" />
          <select name="role" className="rounded-2xl border border-line bg-paper px-4 py-3" aria-label="Role">
            <option value="reviewer">Reviewer</option>
            {current.isSuper ? <option value="agency_admin">Agency admin</option> : null}
            {current.isSuper ? <option value="super_admin">Super admin</option> : null}
          </select>
          <select name="agency_code" className="rounded-2xl border border-line bg-paper px-4 py-3" aria-label="Agency">
            <option value="">None</option>
            {(agencies.data ?? []).map((agency) => <option key={agency.code} value={agency.code}>{agency.acronym}</option>)}
          </select>
          <Button type="submit" variant="outline">Grant role to an existing user</Button>
        </form>
        {current.isSuper ? <InviteForm agencies={agencies.data ?? []} /> : null}
      </section>
      {current.isSuper ? (
        <section>
          <h2 className="font-serif text-3xl font-normal">Recent audit</h2>
          <ul className="mt-3 grid gap-2 text-sm text-ink2">
            {(audit.data ?? []).map((event) => (
              <li key={event.id}>{event.created_at} · {event.visibility} · {event.action}{event.memo ? ` · ${event.memo}` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {current.isSuper ? (
        <section className="grid max-w-xl gap-3">
          <h2 className="font-serif text-3xl font-normal">Add a catalog permit</h2>
          <p className="text-sm text-ink2">This writes a row. It does not invent a legal requirement. Leave it unverified until a source is checked.</p>
          <form action={addPermit} className="grid gap-2">
            <input type="hidden" name="return_to" value="/admin" />
            <Input name="name" required placeholder="Permit name" aria-label="Permit name" />
            <Input name="group_name" required placeholder="Life-event group" aria-label="Group" />
            <Input name="agency_label" placeholder="Agency as printed" aria-label="Agency label" />
            <Input name="agency_code" placeholder="Agency code, if it matches the directory" aria-label="Agency code" />
            <Input name="source" placeholder="Official URL" aria-label="Source" />
            <label className="text-sm"><input type="checkbox" name="unverified" defaultChecked /> Not yet confirmed</label>
            <Button type="submit" variant="outline">Add to catalog</Button>
          </form>
        </section>
      ) : null}
      <QuestionList />
    </div>
  );
}

function QuestionList() {
  return (
    <section>
      <h2 className="font-serif text-3xl font-normal">Still open for Dad</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink2">
        {OPEN_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
      </ol>
    </section>
  );
}

function TemplateList() {
  return (
    <section>
      <h2 className="font-serif text-3xl font-normal">Template, from the public record</h2>
      <ul className="mt-3 grid gap-2">
        {STEPS.map((step) => (
          <li key={step.code} className="rounded-2xl border border-line px-4 py-3 text-sm">
            <span className="font-medium">{step.name}</span>
            <span className="text-muted"> · {step.routing.replaceAll("_", " ")}</span>
            {step.uncertainty ? <p className="mt-1 text-ink2">{step.uncertainty}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
