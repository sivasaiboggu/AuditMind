# AuditMind Design System Spec

This document records the visual identity tokens and UX criteria
implemented for AuditMind. It describes the product as it is in 1.0.7;
earlier revisions of this file described a cyan/indigo glassmorphic
system that no longer exists — do not restore those tokens.

---

## 1. Signature idea — the evidence line

Every risk score is shown with the exact words that earned it. The
pipeline stores the matched words with each clause (`matched_terms`,
see `supabase/migrations/20261025000004_clause_matched_terms.sql`); the
review UI repeats them in one mono line — `Matched: indemnify ·
negligence` — on the clause card, the analysis tab, the compare tab and
the exported report, and underlines the same words in the clause text
itself, in the clause's risk colour. The landing shows one labelled
sample finding the same way. A score never appears without its evidence,
and evidence is never invented: clauses analysed before the field
existed, and tiers that came from a model, show no evidence line.

## 2. Colour — OKLCH tokens, one accent

Tokens are OKLCH triplets (`lightness chroma hue`) in
`apps/web/src/index.css`, resolved per theme; `apps/web/tailwind.config.js`
maps them to `oklch(var(--token) / <alpha-value>)`. The hex each token
was converted from is listed here as the fallback.

| Token | Light (hex fallback) | Dark (hex fallback) |
| --- | --- | --- |
| `--bg-base` | `oklch(0.984 0.004 106.5)` — `#FAFAF7` | `oklch(0.187 0.006 196.6)` — `#101414` |
| `--bg-panel` | `oklch(1.000 0.000 89.9)` — `#FFFFFF` | `oklch(0.224 0.009 184.4)` — `#171D1C` |
| `--bg-hover` | `oklch(0.963 0.004 106.5)` — `#F3F3F0` | `oklch(0.260 0.012 178.5)` — `#1E2624` |
| `--text-primary` | `oklch(0.223 0.005 173.9)` — `#191C1B` | `oklch(0.947 0.008 164.9)` — `#E9EFEC` |
| `--text-secondary` | `oklch(0.410 0.008 174.0)` — `#464C4A` | `oklch(0.729 0.012 176.2)` — `#A0AAA7` |
| `--text-muted` | `oklch(0.553 0.009 164.7)` — `#6E7471` | `oklch(0.612 0.011 174.0)` — `#7D8683` |
| `--overlay` (borders, tints) | `oklch(0.208 0.040 265.8)` — `#0F172A` | `oklch(1.000 0.000 89.9)` — `#FFFFFF` |
| `--accent` | `oklch(0.511 0.086 186.4)` — `#0F766E` (teal-700) | `oklch(0.785 0.133 181.9)` — `#2DD4BF` (teal-400) |

One accent, teal, under 10% of any screen: links, the primary button,
the active tab underline, the score-chip border. Nothing else competes
with it.

### 2.1 Risk hues — per-theme, for text contrast

The bright risk hues fail WCAG AA as small text on white, so the tokens
are per-theme: light mode uses the darker step, dark mode keeps the
bright step. Chart fills in `dashboard.tsx` keep the bright hexes —
fills are not text.

| Risk | Light (hex fallback) | Dark (hex fallback) |
| --- | --- | --- |
| `--risk-critical` | `oklch(0.505 0.190 27.5)` — `#B91C1C` | `oklch(0.637 0.208 25.3)` — `#EF4444` |
| `--risk-high` | `oklch(0.553 0.174 38.4)` — `#C2410C` | `oklch(0.705 0.187 47.6)` — `#F97316` |
| `--risk-medium` | `oklch(0.555 0.146 49.0)` — `#B45309` | `oklch(0.795 0.162 86.0)` — `#EAB308` |
| `--risk-low` | `oklch(0.508 0.105 165.6)` — `#047857` | `oklch(0.696 0.149 162.5)` — `#10B981` |

### 2.2 Contrast table (WCAG, measured from the hex fallbacks)

| Pair | Ratio | Verdict |
| --- | --- | --- |
| Light: primary text on base | 16.42:1 | AAA |
| Light: secondary text on base | 8.39:1 | AAA |
| Light: muted text on base | 4.56:1 | AA |
| Light: accent on base / panel | 5.23:1 / 5.47:1 | AA |
| Light: paper text on accent (primary button) | 5.23:1 | AA |
| Light: critical / high / medium / low text on panel | 6.47 / 5.18 / 5.02 / 5.48:1 | AA |
| Dark: primary text on base | 15.92:1 | AAA |
| Dark: secondary text on base | 7.77:1 | AAA |
| Dark: muted text on base | 4.95:1 | AA |
| Dark: accent on base / panel | 9.96:1 / 9.18:1 | AAA |
| Dark: ink text on accent (primary button) | 9.96:1 | AAA |
| Dark: critical / high / medium / low text on panel | 4.54 / 6.10 / 8.91 / 6.74:1 | AA |

The pre-1.0.7 bright hues as light-mode text were 3.76:1 (critical) and
2.80:1 (high) — below AA for small text. That is what the per-theme
tokens fix.

## 3. Typography

- **Sans (display + text):** IBM Plex Sans 400/500/600/700. One
  superfamily; Inter and JetBrains Mono are out.
- **Mono (labels, IDs, scores, shortcuts, matched words):** IBM Plex
  Mono 400/500/600.
- **Display:** `.display-lg`, fluid `clamp(2.25rem, 4.5vw, 3.5rem)`,
  line-height 1.05, tracking -0.02em.
- **Body:** 16px at 1.6 line height, max 68ch. Numbers that get compared
  use tabular figures (`.tnum`); keyboard hints use the `.kbd` chip.

## 4. Surfaces, elevation, focus

- Solid panels with a hairline border (`border-overlay/5`) and one faint
  shadow (`--shadow-card`). No glass, no backdrop blur, no glows, no dot
  grids.
- Cards are 12px radius (`.rounded-xl`); badges are pills
  (`rounded-full`). One shadow level for resting cards; no hover lift.
- Focus: 2px outline in `--ring` with 2px offset on every focusable
  element (`:focus-visible`).

## 5. Motion — state changes only

- 250ms `cubic-bezier(0.16, 1, 0.3, 1)` for hover/border/focus changes
  (`.precise-transition`); 250ms fade-in for the upload banner.
- The only other motion is progress fills, the loading bar, and the
  typing dots while an answer streams. No staggered entrances, no
  shimmer, no hover lifts, no pulsing orbs. `prefers-reduced-motion`
  collapses all of it to 0.01ms.

## 6. Icons and copy

- Lucide only, small and in flow — no icon tiles, no icon as decoration,
  no emoji or decorative symbols (enforced by the copy-guard test).
- Plain human words; numbers are real numbers from real data, or the UI
  says plainly that a value is demo/sample. Empty states say what to do
  next. No "seamless", "supercharge", "elevate", "unlock", "AI-powered",
  or other marketing clichés (also copy-guard enforced).
