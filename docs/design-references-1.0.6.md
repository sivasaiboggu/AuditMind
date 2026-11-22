# Design references — AuditMind 1.0.6

Collected 22 Nov 2026, before the playbook rebuild. Every screen in this
release is designed from these notes, not from tool defaults.

## References (one line each: what to borrow)

1. **Linear (via Mobbin)** — keyboard-first density: 8px rhythm, one accent,
   hairline borders instead of shadows, `↑` `↓` `/` hints that actually work.
2. **Stripe Dashboard (via Mobbin research)** — big honest numbers on stat
   cards with a caption that says what the number counts; data-dense tables
   where numbers line up.
3. **Attio (CRM lists + detail views)** — dense rows with a status pill and
   a detail pane; dividers do the grouping, not nested cards.
4. **Vercel dashboard** — dark, sharp, confident: solid surfaces, one accent,
   small mono labels, no decoration.
5. **Typewolf: IBM Plex Sans + IBM Plex Mono** — one superfamily for a
   technical product; Plex reads competent without feeling cold, and the mono
   handles IDs, scores and shortcuts in the same voice.
6. **Mimesis, "AI/LLM Design Fingerprints"** — the tells to avoid, named
   plainly: purple gradient + three feature cards + Inter 700 + centred
   everything; eyebrow pill above the hero; icon tiles stacked over headings.
7. **SaaS landing structure (SaaSFrame / Land-book notes)** — left-aligned
   hero with an outcome headline; how-it-works as three numbered steps;
   features written as outcomes, grouped by job.
8. **Page Flows (recorded flows)** — upload → progress → review is one flow
   with one action per step; the upload screen says what happens next.
9. **Happy Hues / Realtime Colors** — one limited palette, previewed live:
   warm paper + ink + a single teal accent; risk colours stay semantic
   (red / orange / yellow / green) and nothing else competes with them.
10. **Refactoring UI** — spacing and type scale: 8px rhythm, one display
    size, tabular figures on every number, labels one weight lighter than
    values.

## Decisions for this release

- **Type:** IBM Plex Sans (400/500/600/700) for everything sans, IBM Plex
  Mono (400/500/600) for labels, IDs, scores and shortcuts. One superfamily;
  Inter and JetBrains Mono are out.
- **Palette:** light paper `#FAFAF7` / ink `#191C1B` / teal `#0F766E`;
  dark `#101414` / `#171D1C` / teal `#2DD4BF`. One accent, as a theme token
  so it adapts; the indigo `#4B4BA0` and violet `#8F47AE` are gone.
- **Icons:** Lucide only, small and in flow — no icon tiles, no icon as
  decoration.
- **Surfaces:** solid panels with a hairline border and one faint shadow.
  No glass, no backdrop blur, no glows, no dot grids.
- **Motion:** state changes only — progress fills, the loading bar, the
  typing dots while an answer streams. No staggered entrances, no shimmer,
  no hover lifts, no pulsing orbs.
- **Numbers:** tabular figures everywhere a number is compared
  (`.tnum`); stat captions say what the number counts.
