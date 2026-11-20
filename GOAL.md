# Goal: PermitGU parity with america.gov (phase 2, set 2026-10-04 by Adam)

Phase 1 (four sourced routes, done 2026-10-02) is summarized at the bottom.

## Purpose
PermitGU should match america.gov's experience for Guam: ask a question, get a
plain answer drawn only from verified official Guam sources, with citations.
EJ Calvo has seen it, so the bar is higher than "demo for Dad": it must look
finished and never state a wrong requirement.

## Done means (parity checklist)
Each round, start by checking the live america.gov (built-in browser JS works
even when the pane is hidden; for visuals use headless Edge, see CLAUDE.md).

1. **Knowledge base.** `kb/` holds one Markdown file per route and service,
   generated from the route pages. Every fact carries its source URL. No fact
   appears in the KB without a source. Unconfirmed facts are marked
   `UNCONFIRMED`.
2. **AI answers.** A Vercel Function `api/ask` (Node, Fluid Compute):
   - Step 1: Jev (TypeSafe, via OpenRouter, see the `integrate-jev` skill)
     classifies the question into a KB topic (or `out_of_scope`) and a
     difficulty (`lookup` or `reasoning`).
   - Step 2: Load only the matching KB file(s). A cheap fast model handles
     `lookup`, and a stronger model handles `reasoning`. Pick the models via
     OpenRouter and record them in CLAUDE.md with prices.
   - Rules: answer only from the loaded KB. Cite source links. If the KB does
     not cover it, say so and name the agency to ask. Never invent fees, forms,
     or timelines. Pass `UNCONFIRMED` facts through as "not yet confirmed".
   - Key: `OPENROUTER_API_KEY` as a Vercel env var, set by Adam (see
     Blockers). Never commit or print it.
3. **Answer UI like america.gov.** Study how america.gov shows an answer, then
   mirror it: the question, a streamed plain-language answer, source chips,
   follow-up suggestions, and the floating ask bar. Fall back to keyword
   results if the API errors.
4. **Evals.** `evals/questions.json` holds at least 25 questions: in-scope
   lookups, multi-step questions, out-of-scope questions, and traps that invite
   invented fees. A script runs them against the live endpoint and grades them
   on correct topic, cites a source, no invented numbers, and refuses when out
   of scope. Target: 100% on the no-invention and refusal checks, and at least
   90% overall.
5. **Header menu like america.gov.** A "Menu" pill that opens a panel listing
   the routes, services, How it works, Privacy, and About.
6. **Privacy page updated.** It must say that typed questions go to OpenRouter
   and the model providers, and that nothing is stored by PermitGU.
7. **Quality bar on every page:** phone, desktop, and dark mode; no horizontal
   overflow; no JS errors; links checked (dphss.guam.gov 403s are known); the
   "Unofficial demo" banner and "Demo" pill present; Guam-only photos
   (location-verified on Unsplash, credited).

When 1-7 hold, or only Blockers remain: stop and report.

## Rules
- One america.gov feature per round where possible. Commit, push, deploy to
  production from a clean pushed commit, and verify https://permitgu.vercel.app
  after each round. The Vercel CLI needs `--scope adamtpangs-projects`.
- Never enter API keys or secrets anywhere. If a key is needed, add the name
  to Blockers.
- Watch cost: log any AI spend per round, using cheap models by default.
- Keep the "Unofficial demo" banner until Adam says the site is officially
  adopted.

## Blockers (need Adam)
- [ ] Add `OPENROUTER_API_KEY` to Vercel production:
      `npx vercel env add OPENROUTER_API_KEY production --scope adamtpangs-projects`
- [ ] Rename to permitgu everywhere (folder, repo, Vercel project). Spun off as
      a separate task.

## Saved for later (Adam, 2026-11-20)
- Email updates to applicants and staff. Needs a mail service key. Until then,
  updates show on the site only.
- Online payment through Stripe. The fee steps are tracked, nothing is charged.
  Do not build either until Adam restarts it.

## Published-time research, 2026-11-20 (no figure found)
Searched and found no processing time: 21 GCA ch. 66 (plan review is only
"promptly"), 21 GCA §61620 (variance decision "within a reasonable time"),
11 GCA ch. 70 and 3 (business and alcohol licenses), 12 GCA ch. 14 (Waterworks),
5 GCA ch. 53 (road work review), OPA report 11-05, and the clearance pages of Land
Management, Guam EPA, Fire, Public Health, Parks, and Agriculture. The 2022 BSP
Guidebook and the 1994 checklist manual return 404. Do not repeat these searches.
These waits have to come from Dad, the agencies, or real files.

## Questions for Dad (and EJ's team)
Everything else on this list was answered from official sources on 2026-10-04.
- Food truck: where can a truck park and sell, and who approves the spot?
- Food truck: is a commissary kitchen required?
- Current DPW and Guam EPA fee schedules in dollars (none published online).
- Which inspections does DPW require for a typical home (the Director's list)?
- Real wait times for each permit and clearance, and where people get stuck.
- Typhoon: did DPW fast-track repair permits after Mawar in practice?
- Photos: can anyone share real Guam photos (a food truck, a permit counter,
  roof repair) we may use with credit?

## Phase 1 summary (done 2026-10-02)
Four routes built from primary sources: food truck, typhoon repair, build,
and clear/grade/septic. Each step links its official source, unconfirmed facts
sit in yellow boxes, and every link is checked.
