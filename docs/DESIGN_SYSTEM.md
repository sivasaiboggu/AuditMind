# AuditMind design system

## A margin bracket for the words that matter

AuditMind is a web workspace for people doing an initial contract review. Its job is to take reviewers from a risk label to the source wording they need to read. The margin bracket marks evidence on the landing example and in clause review. It also marks the selected row in the clause index. When a stored clause has matched terms, the reading pane underlines them in context and lists them below the source. An older clause uses the same reading layout and shows its saved score and explanation when available.

## Color

The 12-step warm neutral ramp runs from `#fcfbf7` to `#191814`. Light mode uses a paper base and a brighter reading surface. Dark mode uses warm charcoal and a lighter reading surface so the same hierarchy survives the theme change. Risk labels use semantic red, rust, ochre and green, always paired with words. Hairline separators organize content. The stronger control outline identifies fields and secondary buttons.

Three accent options were considered.

- **Cobalt `#2448b7`**, selected. It reads as an editorial annotation against warm paper and stays distinct from every risk color. Dark mode uses `#a9bbff`.
- **Deep teal `#12635e`** suggests a steady workspace and works on paper. It sits too close to the green used for low risk and success.
- **Aubergine `#653a6d`** gives public pages a more literary tone. It competes with the critical label in a dense review.

Cobalt is reserved for the margin, links, focus, selected navigation and primary actions. Surface areas stay neutral. Accent-colored pixels accounted for at most 1.3% of each captured after view, counting pixels within an RGB distance of 15 from either theme’s accent. The sample is a charcoal reading surface in either theme. Grain appears there alone.

[Machine-readable tokens](../apps/web/tokens.json), [CSS custom properties with OKLCH and hex fallbacks](../apps/web/src/styles/tokens.css), and the [Tailwind theme](../apps/web/tailwind.config.js) define the production palettes.

## Measured contrast

Ratios use the WCAG 2.x relative-luminance formula on the sRGB fallback for each OKLCH color. For text, risk, control and focus roles the table reports the lowest ratio across the theme's base, panel and hover surfaces. The button hover row uses the 90/10 sRGB interaction mix. Separators between noninteractive regions are decorative.

| Pair | Light | Dark | WCAG AA |
| --- | ---: | ---: | ---: |
| Primary text | 14.91:1 | 11.34:1 | 4.5:1 |
| Secondary text | 6.41:1 | 7.85:1 | 4.5:1 |
| Muted text and labels | 4.85:1 | 5.67:1 | 4.5:1 |
| Accent text and source underlines | 6.56:1 | 6.84:1 | 4.5:1 |
| Critical label | 5.83:1 | 6.86:1 | 4.5:1 |
| High label | 5.97:1 | 6.83:1 | 4.5:1 |
| Medium label | 5.77:1 | 7.34:1 | 4.5:1 |
| Low and success labels | 5.72:1 | 7.12:1 | 4.5:1 |
| Control outlines | 3.16:1 | 3.50:1 | 3:1 |
| Keyboard focus ring | 6.56:1 | 6.84:1 | 3:1 |
| Primary button label | 7.64:1 | 8.46:1 | 4.5:1 |
| Primary button label on hover | 6.07:1 | 7.12:1 | 4.5:1 |

## Layout, type and motion

- Bricolage Grotesque supplies display and reading type. IBM Plex Mono 500 supplies labels, shortcuts and metadata. Fontsource serves local WOFF2 subsets with swap. Display sizes use `clamp()` and tight tracking. Reading copy is 16–18 px with a 1.6 line height and a measure of at most 68 characters.
- Start at 16 px mobile gutters. Step to 32 px and then 48 px when the layout has room. Components use 4 px increments and section spaces use multiples of 8 px. Interactive corners use 4 px. Document edges stay square.
- Inset hairline, sheet shadow and floating shadow are the three elevation levels. The reference sample and notifications use the floating shadow. Most workspace surfaces are flush.
- Lucide handles action icons. The AuditMind mark takes its shape from the margin bracket and appears in the wordmark, favicon and install icons.
- Focus is a visible 2 px outline. Buttons acknowledge press with a 1 px shift over 180 ms. Notifications enter over 220 ms with a short opacity and transform change. Routing puts focus back in the new page and paints immediately. Skeletons are static and the upload meter uses server progress. Reduced-motion settings suppress transitions.

[Screen plans, setup and launch checklist](redesign/review-desk.md)
