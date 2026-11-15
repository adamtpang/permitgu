# How the National Design Studio designs government sites, and what PermitGU should take from it

Researched 2026-11-15. The studio is the National Design Studio at ndstudio.gov (Chief Design Officer Joe Gebbia). ndstudio.org is an unrelated Japanese architecture firm.

Three inputs: the studio's own words (two executive orders, ndstudio.gov, americabydesign.gov, america.gov, press interviews), independent commentary, and measurements I took on seven of their live sites and eight PermitGU pages with the same script.

## 1. What they say

They have published no numbered list of principles and no design system. These are assembled from their copy and two executive orders.

| Principle | Their words | Source |
|---|---|---|
| Usable and beautiful together | "both usable and beautiful" | EO 14338, 2025-08-21 |
| Give people their time back | "Months reduced to minutes. Ninety clicks become nine. Complexity becomes clarity." | ndstudio.gov |
| Lost time is a dignity problem | "That isn't just inefficient. It's undignified." | ndstudio.gov |
| Organize around people, not agencies | "a system organized around the structure of Government rather than the needs of the people" (named as the problem) | EO 14432, 2026-09-29 |
| Government does its own paperwork | "do its own paperwork so that the American people may get on with their lives" | EO 14432 |
| Plain language, one entry point | "sign in, communicate in plain language, receive accurate answers" | EO 14432 |
| Consumer-grade bar | "an Apple Store like experience" | americabydesign.gov |
| Hospitality: anticipate the need | "The same way a hotelier anticipates the needs of their guests." | americabydesign.gov |
| A better option, not the only one | "provides a better option but does not become the only option" | EO 14432 |
| Named quality standards | "quality, simplicity, accessibility, interoperability, security, reliability, and design" | EO 14432 |

How they measure: clicks and elapsed time. Reported examples are federal retirement going from months to minutes, and one workflow going from 87 clicks to 12. They publish no completion-rate or usability-test numbers.

## 2. What they do, measured

Desktop, 1366 by 900. "First screen" is the visible words before scrolling.

| Site | Words, first screen | Words, whole page | Screens long | Words per screen | Median paragraph | Large images or video | Headline size | Body size |
|---|---|---|---|---|---|---|---|---|
| ndstudio.gov | 30 | 164 | 7.1 | 23 | 4 | 19 | 44px | 16px |
| america.gov | 144 | 624 | 8.5 | 73 | 6 | 35 | 96px | (not measured) |
| trumprx.gov | 62 | 541 | 12.9 | 42 | 9 | 6 | 149px | (not measured) |
| realfood.gov | 45 | 1025 | 22.4 | 46 | 23 | 51 | 170px | 16px |
| trumpaccounts.gov | 60 | 791 | 14.9 | 53 | 4 | 25 | 92px | 20px |
| techforce.gov | 19 | 1200 | 7.4 | 162 | 35 | 3 | 195px | 21px |
| retire.opm.gov | 37 | 509 | 8.3 | 61 | 12 | 5 | 72px | 20px |

| PermitGU page | Words, first screen | Words, whole page | Screens long | Words per screen | Median paragraph | Longest paragraph | Large images | Headline size |
|---|---|---|---|---|---|---|---|---|
| / (home) | 53 | 825 | 5.8 | 142 | 14 | 37 | 1 | 118px |
| /food-truck | 177 | 934 | 4.5 | 207 | 15 | 185 | 0 | 80px |
| /build | 179 | 899 | 4.2 | 214 | 16 | 171 | 0 | 80px |
| /help | 150 | 1259 | 5.2 | 242 | 18 | 388 | 0 | 80px |
| /apply | 222 | 857 | 3.4 | 252 | 25 | 50 | 0 | 60px |
| /apply/business-license | 263 | 698 | 2.4 | 290 | 32 | 48 | 0 | 60px |
| /permits | 204 | 1298 | 14.2 | 91 | 1 | 77 | 0 | 48px |
| /agencies | 223 | 1695 | 9.8 | 173 | 6 | 163 | 0 | 48px |

What the numbers say:

- **Word count is not the gap. Density is.** Their pages hold 500 to 1,200 words, about the same as ours. They spread them over 7 to 22 screens. We pack ours into 2 to 5. Six of their seven sites sit between 23 and 73 words per screen. Seven of our eight pages sit between 142 and 290.
- **First screen.** Theirs: 19 to 62 words on six of seven sites. Ours: 150 to 263 on every page except the home page, which is already at 53.
- **Paragraphs.** Their median is 4 to 12 words on five of seven sites. Ours is 14 to 32, with single blocks of 163 to 388 words.
- **Pictures.** They carry 3 to 51 large images or videos per page. Seven of our eight pages carry none.
- **Type.** A large serif headline over a plain sans body: Instrument Serif on three of their sites, Rhymes Text on america.gov, with Inter or Geist beneath. PermitGU already uses Instrument Serif and Inter. Their body text is 16 to 21px. Their headlines run 72 to 195px, and ours drop to 48 to 60px on the tracker pages.
- **Shape and color.** Full pill buttons and 32 to 40px card corners. Four of seven use a warm off-white page (#F5F4EB, #F2EEE6, #F7F6F4, #FDFBEE). america.gov is pure white with navy ink #000C1F and one red, #D80007.

Measurement limits: one visit per site, signed out, desktop and phone. Body size was read from the longest paragraph, which on some pages is a caption or note. Headline size on two of their sites was read from an oversized display line.

## 3. What independent reviewers found

Praise, mostly for america.gov:

- Describing a need in your own words, with official sources linked on every answer, was credited as a real improvement.
- A privacy researcher tried to submit a made-up Social Security number and the chat stripped it.
- A physician's 37-question test found sound triage and consistent answers in Spanish.

Criticism, mostly of build quality and depth:

- **Accessibility.** One teardown of americabydesign.gov (August 2025) counted 288 automated issues: no headings, an unlabeled field, autoplay video with no controls. Later sites improved unevenly.
- **Weight.** About 3 MB for one page of text on that same site.
- **Billboards.** Reviewers found many launches were one page with a sign-up box and no task to complete.
- **Stale or wrong answers.** The chat followed the newest agency page and missed a court order, and described a price cap from an old pilot.
- **Tracking.** The Guardian found PostHog on four of their sites, with session recording on two and no disclosure. It was removed after the paper asked. PermitGU also uses PostHog. Ours is disclosed on the privacy page, with session recording off.
- **Consistency.** Fonts and looks vary widely between their sites.

Most critics are former federal digital-service staff or opposed to the administration. Treat tone as opinion and counts as findings. I read several of these through a summarizing tool, so check wording at the source before quoting anyone.

## 4. What this means for PermitGU

Take:

1. **One idea per screen.** Spread the same content over more, calmer screens. Target 40 to 80 words per screen on entry pages.
2. **Lead with the task.** A headline, one sentence, one action. Explanations come after, or behind a tap.
3. **Short lines.** Median paragraph under 12 words. No block over 60. Long legal notes move into collapsed "Why" and "Source" panels.
4. **Show, don't describe.** A step tracker, a timeline, an agency map and real Guam photos carry what paragraphs carry now.
5. **Bigger type, fewer sizes.** Body at 18 to 20px. Headlines at 72px and up on every page, including the tracker.
6. **Count clicks and minutes.** Publish how many steps and clicks each permit takes on PermitGU against the paper route. That is their headline metric.

Keep, because their sites are weaker here:

- Real headings, labeled fields, visible focus, reduced-motion support, and pages that read without JavaScript.
- Light pages. No autoplay video, no scroll effects.
- Sources and research dates on every fact, and "Not yet confirmed" where a source is missing. Reviewers faulted america.gov for exactly this gap.
- Plain disclosure of what is collected.

Do not copy: their logos, names, or anything that implies affiliation. The unofficial banner stays.

One tension to settle: PermitGU is a service site that must be legally accurate. Their thinnest pages are campaign pages. The model to follow is america.gov and retire.opm.gov, which have tasks to complete, not the one-page announcements.

## 5. After the v4 redesign (2026-11-15)

Same script, desktop 1366 by 900, signed out. The script was tightened for this run so that text inside a closed fold does not count as visible, and both columns were measured with the tightened version. The home page was not changed.

| Page | Words, first screen | Visible words, whole page | Words per screen | Typical line | Large images | Headline |
|---|---|---|---|---|---|---|
| /food-truck | 177 to 75 | 934 to 484 | 208 to 105 | 13 to 12 | 0 to 1 | 80px to 104px |
| /build | 179 to 104 | 899 to 434 | 214 to 96 | 15 to 15 | 0 to 1 | 80px to 104px |
| /apply | 222 to 116 | 857 to 290 | 252 to 83 | 23 to 9 | 0 to 1 | 60px to 104px |
| /apply/business-license | 263 to 116 | 698 to 314 | 291 to 90 | 28 to 11 | 0 to 1 | 60px to 104px |
| /permits | 204 to 91 | 1298 to 218 | 91 to 75 | 1 to 5 | 0 to 0 | 48px to 104px |
| /agencies | 223 to 89 | 1695 to 491 | 173 to 78 | 5 to 5 | 0 to 2 | 48px to 104px |
| /help | 150 to 95 | 1259 to 527 | 242 to 146 | 16 to 16 | 0 to 0 | 80px to 104px |

Read with care:

- Nothing was deleted. The words not visible are one tap away: a step that opens, a note that unfolds, a group that expands. With JavaScript off every guide step is open.
- The first screen is still above the 60-word target on every page. The unofficial banner and the header account for about 30 of those words.
- /help is still the densest page at 146 words per screen. Its agency directory is one long block.
- "Large images" on the tracker pages are the agency diagrams, not photos.
