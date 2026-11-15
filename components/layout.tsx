import { cn } from "@/lib/cn";

// Page building blocks for design system v4: one idea per screen. See DESIGN.md.

// The top of every page: a small label, one large headline, one sentence, one action.
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="pb-10 pt-10 sm:pt-16">
      {eyebrow ? <p className="text-sm font-medium uppercase tracking-wider text-muted">{eyebrow}</p> : null}
      <h1 className="display mt-4 text-ink">
        {title}
      </h1>
      {lede ? <p className="mt-6 max-w-[34rem] text-[clamp(1.25rem,2.6vw,1.5rem)] leading-[1.35] text-ink2">{lede}</p> : null}
      {children ? <div className="mt-8 flex flex-wrap items-center gap-3">{children}</div> : null}
    </header>
  );
}

// Two to four large numbers with a short label under each.
export function Glance({ facts }: { facts: { value: React.ReactNode; label: string }[] }) {
  return (
    <dl className="grid max-w-[44rem] grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="font-serif text-[clamp(2.6rem,8vw,4.25rem)] leading-none tracking-[-0.035em] text-ink">{fact.value}</dt>
          <dd className="mt-2 text-[0.95rem] leading-snug text-ink2">{fact.label}</dd>
        </div>
      ))}
    </dl>
  );
}

// A section with a large serif title and room around it.
export function Section({ title, lede, children, className }: { title?: string; lede?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("py-10 sm:py-14", className)}>
      {title ? <h2 className="font-serif text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.05] tracking-[-0.03em]">{title}</h2> : null}
      {lede ? <p className="mt-3 max-w-[34rem] text-lg text-ink2">{lede}</p> : null}
      <div className={title || lede ? "mt-6" : undefined}>{children}</div>
    </section>
  );
}

// Detail that stays one tap away. Built on the browser's own disclosure, so it works
// with the keyboard, a screen reader, in-page search, and without JavaScript.
export function Fold({
  title,
  note,
  open,
  children,
  id,
}: {
  title: React.ReactNode;
  note?: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <details id={id} open={open} className="group border-t border-line last:border-b">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
        <span className="font-serif text-[clamp(1.5rem,3.4vw,2rem)] leading-tight tracking-[-0.02em]">{title}</span>
        <span className="flex flex-none items-center gap-3 text-sm text-muted">
          {note}
          <span aria-hidden="true" className="text-2xl leading-none group-open:hidden">+</span>
          <span aria-hidden="true" className="hidden text-2xl leading-none group-open:inline">&minus;</span>
        </span>
      </summary>
      <div className="pb-8 pt-1">{children}</div>
    </details>
  );
}

// A large tap target that leads somewhere.
export function ActionCard({ href, label, title, children }: { href: string; label?: string; title: string; children?: React.ReactNode }) {
  return (
    <a href={href} className="block rounded-[32px] border border-line p-7 text-ink no-underline transition hover:border-ink2">
      {label ? <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span> : null}
      <span className="mt-2 block font-serif text-[clamp(1.7rem,3.6vw,2.25rem)] leading-[1.05] tracking-[-0.025em]">{title}</span>
      {children ? <span className="mt-3 block text-ink2">{children}</span> : null}
      <span aria-hidden="true" className="mt-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper">&rarr;</span>
    </a>
  );
}

// A row of bars for a small set of counts. Each bar's width is its share of the largest.
export function Bars({ rows }: { rows: { label: string; value: number; href?: string }[] }) {
  const most = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.label} className="grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 text-[0.95rem]">
          {row.href ? <a href={row.href} className="truncate">{row.label}</a> : <span className="truncate">{row.label}</span>}
          <span className="h-3 rounded-full bg-soft" aria-hidden="true">
            <span className="block h-3 rounded-full bg-gu" style={{ width: `${Math.max(4, (row.value / most) * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-ink2">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

// What just happened, after an action. The words come from a fixed list, keyed by a code.
export function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="mb-6 rounded-2xl border border-good px-5 py-4 text-lg text-good" role="status">
      {text}
    </p>
  );
}

export function ErrorNotice({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mb-6 rounded-2xl border border-bad px-5 py-4 text-bad" role="alert">
      {text}
    </p>
  );
}
