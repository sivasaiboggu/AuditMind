# Design references — AuditMind 1.0.7

Round 10, a master-prompt polish on the 1.0.6 identity. Nothing is
redesigned from scratch: the typeface (IBM Plex Sans + Mono), the teal
accent, the solid surfaces and the left-aligned landing all stay. This
round deepens them.

## References (one line each: what to borrow)

1. **Linear (via Mobbin)** — keyboard-first density: 8px rhythm, one
   accent, hairline borders instead of shadows, `↑` `↓` `/` hints that
   actually work. Still the density model for the review workspace.
2. **Stripe Dashboard (via Mobbin research)** — big honest numbers on
   stat cards with a caption that says what the number counts; data-dense
   tables where numbers line up. Still the stat-card model.
3. **Refero (styles.refero.design / refero.design)** — real product
   flows, not marketing pages: the review workspace is designed as a
   flow (upload → progress → review → chat → export), one action per
   step, with the evidence next to the decision it supports.

## Decisions for this release

- **Signature idea — the evidence line.** The core promise is "a real
  risk score for every contract, with the exact words that earned it",
  and 1.0.6 showed the score but not the words. Every risk score now
  ships with the exact matched words, in mono, in the risk colour,
  repeated on the clause card, the analysis tab (underlined in the
  clause text itself), the compare tab, the exported report, and one
  labelled sample finding on the landing. The words come from the
  pipeline (`matched_terms`), never re-derived in the browser, and the
  line is omitted — not invented — when nothing was stored.
- **Type:** unchanged — IBM Plex Sans + IBM Plex Mono. The evidence
  line is mono because it is data, not prose.
- **Palette:** unchanged hues, new encoding — theme tokens are now
  OKLCH triplets with hex fallbacks (see docs/DESIGN_SYSTEM.md). Risk
  hues became per-theme tokens: the bright hues failed WCAG AA as small
  text on white (critical 3.76:1, high 2.80:1), so light mode uses the
  darker -700 step while dark mode keeps the bright step. Full contrast
  table in the design-system doc; every text pair now passes AA.
- **Icons:** Lucide only, unchanged.
- **Surfaces:** solid panels with a hairline border and one faint
  shadow, unchanged. No glass, no backdrop blur, no glows, no dot grids.
- **Motion:** state changes only, unchanged.
- **Numbers:** tabular figures everywhere a number is compared
  (`.tnum`); stat captions say what the number counts, unchanged.
- **Whole-word evidence:** the review rules now match at word
  boundaries, so "determination" no longer fires the terminate rule and
  "non-confidential" no longer fires the confidentiality rule. The
  evidence line would have shown the wrong words otherwise — the design
  change forced the correctness fix.
