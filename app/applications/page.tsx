import Link from "next/link";
import { SetupNotice } from "@/components/shell";
import { StatusBadge } from "@/components/tracker";
import { session } from "@/lib/session";

export const metadata = { title: "Your applications" };

export default async function ApplicationsPage() {
  const current = await session();
  if (!current.configured) return <SetupNotice />;
  if (!current.user) {
    return <p className="text-ink2"><Link href="/sign-in?next=/applications">Sign in</Link> to see your drafts.</p>;
  }
  const { data } = await current.supabase.from("applications").select("id, status, lot, tract, block, created_at, permit_number").order("created_at", { ascending: false });
  return (
    <div className="grid gap-6">
      <h1 className="font-serif text-5xl font-normal">Your applications</h1>
      <Link className="w-fit rounded-full bg-navy px-4 py-2 text-white no-underline" href="/apply">Start another draft</Link>
      <ul className="grid gap-3">
        {(data ?? []).map((row) => (
          <li key={row.id} className="rounded-3xl border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link className="font-medium no-underline" href={`/applications/${row.id}`}>
                Lot {row.lot || "—"}, tract {row.tract || "—"}, block {row.block || "—"}
              </Link>
              <StatusBadge status={row.status} />
            </div>
            {row.permit_number ? <p className="mt-2 text-sm text-muted">Demo number {row.permit_number}. Not an official DPW number.</p> : null}
          </li>
        ))}
      </ul>
      {data?.length ? null : <p className="text-ink2">No applications yet.</p>}
    </div>
  );
}
