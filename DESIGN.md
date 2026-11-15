# PermitGU design system, v4

Set 2026-11-15. Rule one: **one idea per screen.** The research behind it is in `DESIGN_RESEARCH_NDS.md`. The visual standard is america.gov (see `CLAUDE.md`). This file is how that standard is applied here.

PermitGU has two front ends that share one look:

- **Guides:** static HTML in `public/`, styled by `public/styles.css`, enhanced by `public/guide.js`.
- **Tracker:** the Next.js app in `app/`, styled by Tailwind (`app/globals.css`) with shared pieces in `components/layout.tsx`.

Change a token in both places.

## Targets

Measured with `measure.mjs` at 1366 by 900 (method in `DESIGN_RESEARCH_NDS.md`).

| Measure | Target |
|---|---|
| Words on the first screen | 60 or fewer |
| Words per screen, entry pages | 40 to 80 |
| Longest visible block | 60 words |
| Headline | 52px on a phone, up to 104px on a desktop |
| Body text | 18px |
| Tap targets | 44px or taller |

A page may hold as many words as it needs. They sit behind a tap, not on the first screen.

## Tokens

| Token | Value | Guides (`styles.css`) | Tracker (Tailwind) |
|---|---|---|---|
| Ink | `#000c1f` | `--ink` | `text-ink` |
| Secondary text | `#334155` | `--ink2` | `text-ink2` |
| Muted | `#64748b` | `--muted` | `text-muted` |
| Line | `#e8ebf0` | `--line` | `border-line` |
| Soft fill | `#f5f7fa` | `--soft` | `bg-soft` |
| Page | `#ffffff` | `--bg` | `bg-paper` |
| Brand navy | `#012d5c` | (logo) | `bg-navy` |
| Brand blue | `#028beb` | (logo) | `bg-gu` |
| Not confirmed | `#fff7e0` on `#f3d488` | `--warn`, `--warnline` | `bg-warn`, `border-warnline` |
| Display type | Instrument Serif, `clamp(3.25rem, 9.5vw, 6.5rem)`, line 0.96, tracking -0.045em | `--t-display` | `display` |
| Tool headline | Instrument Serif, `clamp(2.6rem, 6vw, 4rem)` | | `display-sm` (staff pages) |
| Section title | Instrument Serif, `clamp(2rem, 5vw, 3rem)` | `--t-title` | `Section` |
| Step title | Instrument Serif, `clamp(1.6rem, 3.6vw, 2.25rem)` | `--t-step` | `Fold` |
| Lede | Inter, `clamp(1.25rem, 2.6vw, 1.5rem)`, line 1.35 | `--t-lede` | `PageHero` |
| Body | Inter 18px, line 1.6 | `--t-body` | body |
| Small | 0.95rem | `--t-small` | `text-[0.95rem]` |
| Card corner | 32px | `--r-card` | `rounded-[32px]` |
| Field corner | 20px | `--r-field` | `rounded-2xl` |
| Buttons and chips | full pill | `--r-pill` | `rounded-full` |
| Reading width | 34rem | `--measure` | `max-w-[34rem]` |

Dark mode swaps the color values and nothing else. Both stylesheets carry the dark set.

## Page pattern

Every page, in this order:

1. **Hero.** A small label, one headline, one sentence, at most two actions. `PageHero`, or `.route-hero`.
2. **Glance.** Two to four large numbers. `Glance`, or `.glance` (built by `guide.js` from the page itself).
3. **A picture.** A Guam photo on a guide, the agency diagram or the step tracker on the tracker.
4. **The task.** The steps, or the draft.
5. **Detail, folded.** `Fold` on the tracker. On a guide, each step opens on a tap and long notes fold to two lines.
6. **Where next.** One or two `ActionCard` links.

## Components

Tracker (`components/layout.tsx`, `components/steps-overview.tsx`):

- `PageHero`, `Glance`, `Section`, `Fold`, `ActionCard`, `Bars`
- `AgencyHub`: who touches a permit. The lead agency is in the middle. A solid ring means every file. A dashed ring means only when routed.
- `StepsByPhase`: every step, one stage open at a time.
- `OpenOnHash`: a link to a folded section opens it.

Guides (`public/guide.js`):

- Steps open one at a time, with "Open all steps".
- A note longer than about 170 characters folds to two lines with "Read the full note".
- The three counts under the headline come from the page: numbered steps, official links inside the steps, and "Not yet confirmed" boxes.

## Rules that do not bend

- **Nothing is hidden from a reader without JavaScript.** Guide steps and notes are open in the HTML and fold only when `guide.js` runs. Tracker folds use the browser's own `<details>`.
- **The knowledge base reads the HTML, not the screen.** `tools/build_kb.py` is unaffected by folding. Do not move guide content into JavaScript.
- **Every fact keeps its source link** and every unconfirmed fact keeps its yellow box, folded or not.
- **Real headings, labeled fields, visible focus, 44px targets, reduced motion respected.** No autoplay, no scroll effects.
- **Photos are of Guam,** location-checked on Unsplash, with alt text and a credit line.
- **The unofficial banner stays** on every page, in the same words on both front ends.
- **Numbers on a page are counted, not claimed.** If a count cannot be computed from the page or the database, it does not go in a `Glance`.
- **No em dashes** in any text.

## Not done yet

- The home page and `/ask` predate v4. They already meet the first-screen target and were left alone.
- Staff pages (`/review`, `/admin`) use the smaller headline and are otherwise unchanged. They are work tools and dense on purpose.
- A count of clicks against the paper route needs a measured paper route. Nobody has published one for Guam.
