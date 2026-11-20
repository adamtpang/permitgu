# PermitGU demo walkthrough

For the call with Dad. Written 2026-11-15. Site: https://permitgu.vercel.app

## What to say first

- It is an unofficial demo. It is not a Government of Guam site and nothing in it reaches an agency.
- Every step comes from a public source: an agency page, a form, or the law. Anything we could not confirm is marked "Not yet confirmed".
- The files in it are sample files. Their timings are made up so the tracker has something to show. The site says so wherever an estimate appears.

## The seven requests, and where each one is

| # | He asked for | Where to show it | State |
|---|---|---|---|
| 1 | Apply across the ~51 agencies | `/permits` (331 permits and applications, 71 agencies leading at least one; the 9 with none are listed in the catalog's Gaps), then "Track one now" | 18 permits can be started and tracked. More are added in an admin page with no code change |
| 2 | Pizza tracker with an ETA | Any file page: the stage bar, "Where it is now", "Estimated time" | Works. ETA is from sample files, labeled as sample |
| 3 | Which agencies, which steps | `/apply`, `/apply/business-license`, `/apply/x_zone_variance`: "Who touches it" and "The steps" | Works for the 18 tracked permits |
| 4 | Verbose logging | A file page, "History". Staff: `/admin/audit` | Works. Every action, who, when |
| 5 | Secure document storage | Upload on a draft. Papers open only for the applicant and the staff on the file, by a link that lasts 60 seconds | Works. Virus scanning is not connected |
| 6 | Admin panel for agency staff | `/review` (queue, backlog by agency), a file in `/review`, `/admin` | Works |
| 7 | Separate sign-ins | `/sign-in` (email link) and `/staff/sign-in` (password plus authenticator app) | Works |

## A five-minute path through it

1. **Home.** One search box, the guides, "Track a permit".
2. **`/permits`.** Every permit we found, grouped by goal. Open a group. The agency chips show who touches each one.
3. **`/apply/x_zone_variance`.** The picture of who touches it, the count of steps, the steps by stage, each with its source.
4. **Start a file.** Sign in, fill the short draft, upload a paper, submit.
5. **The file page.** Stage bar, where it is now, the estimate ("Sample data" label), every step with its own time.
6. **Staff side, `/review`.** The queue, oldest first, with days waiting. Backlog by agency at the bottom.
7. **Open the file as staff.** Start review, approve, enter the fee, mark it paid, issue it.
8. **Back on the file page.** It moved. "Your files" says what changed since you last looked. History shows every action.
9. **`/admin/permits`.** Add a permit without code: questions, review steps, papers, switch it on.

## What is real and what is sample

- **Real:** the guides, the catalog, the agency list, every step and note on the eighteen trackers, the law and form citations, fees where an agency published one (sanitary permit $568 a year, zone variance $75).
- **Sample:** the 90 files in the queue, the five sample applicants, the sample reviewers, and every duration. Where a law, rule, or agency publishes a time for a step (27 steps so far, such as the Seashore Commission deciding within 60 days of the hearing), it is shown beside the step with its source, on the permit's start page and on the file page. It is never mixed into the sample estimate.
- **Assumed, and marked that way on the page:** which house permit steps apply to every house, and that every review step on a built permit opens together.

## What it does not do yet

- No email when a file moves. The site shows it in "Your files" instead.
- No virus scan on uploads.
- No payment. Fees are entered by staff and paid in person.
- Only one real staff account exists (Adam's). Sample reviewers cannot sign in. A new staff member signs in once with an email link, gets a role on `/admin`, then sets a password and an authenticator app.
- 18 of 331 cataloged permits are trackable. Every agency was researched on 2026-11-20; 84 entries are marked unverified, and few fees are confirmed. Every step comes from an official form or the law. Where an agency does not publish what it checks, the step says so on the page.

## Questions for him

1. Which permits should come next? The best-sourced one to show is the contractor's license: twelve steps from the Board's own 2024 packet, with its exam dates and 45-day decision rule. The rest of the catalog has no sourced steps yet.
2. What should the ETA be based on once real files exist: the tracker's own history, published agency targets, or both side by side as it is now?
3. Who would pilot it, and who on the government side would use the staff queue?
4. How should it describe its relationship to the government? Today it says only that agency staff and the incoming administration are invited to correct it.
5. The five open questions about the house permit, listed at the bottom of `/admin`.

## Before the call

- Sign in at `/staff/sign-in` first so the staff pages open without a pause.
- The file "Lot 7 Block 3 Tract 100 (agent test)" in "Your files" is a finished zone variance from a full test pass on 2026-11-15. It is marked as a test file.
- To clear the sample files later: `/admin`, "Sample data", "Stop using sample files".
