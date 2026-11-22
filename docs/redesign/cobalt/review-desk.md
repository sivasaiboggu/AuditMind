# AuditMind cobalt review desk

AuditMind helps contract reviewers read an agreement, see the wording behind a finding, and record what to do next. The first review starts on the home page with two findings from a sample mutual NDA. Both are available without signing in.

## Reference study

| Reference | Pattern studied | Applied to AuditMind |
| --- | --- | --- |
| [21st.dev tables](https://21st.dev/community/components/s/table) and [popovers](https://21st.dev/community/components/s/popover) | Compact data rows, independent row actions, and contextual detail | The register uses a fixed reading order for contract name, progress and delete. The evidence memorandum remains visible next to the clause on wide screens. |
| [Designeer archive](https://archive.vn/2026.09.26-133235/https%3A/designeer.xyz/) | The archive indexed 60fps among examples of purposeful interface movement | Borrowed the emphasis on animating a state change the reviewer initiated. The live domain was inaccessible. The search index exposed the archive text. |
| [React Bits Animated Content](https://reactbits.dev/animations/animated-content) | A short reveal can establish where new content arrived | The finding, document, comparison and chat panes use a small translation and opacity change when they replace each other. |
| [Magic UI Animated List](https://magicui.design/docs/components/animated-list) | A brief delay in row arrival makes a new list readable as a group | Register rows enter in reading order with 36 ms intervals for the first four positions. Remaining rows share the last delay. |
| [Uiverse buttons](https://uiverse.io/buttons) | Physical press feedback and independent icon motion | Buttons compress slightly on press. Arrow movement follows navigation actions. |
| [Mobbin bottom sheets](https://mobbin.com/glossary/bottom-sheet) | Supplemental actions stay close to their source. Frequent switching can make a modal sheet cumbersome. | The evidence and decision panel follows the clause in the mobile flow. An explicit jump avoids a second, modal navigation layer. |
| [Inspora website archive](https://www.inspora.design/websites) | Typographic and minimal treatments organized by software and productivity | The entrance uses an editorial headline, a reachable sample, and no static interface illustration. The bare domain was inaccessible. The `www` site worked. |
| [Refero Styles](https://styles.refero.design/) | The paper and serif studies, including Steep and Seline, use typography and surface contrast to organize dense information | A warm sheet holds the source text. An ink-neutral desk holds the index and review form. |

## Identity and tokens

The signature mark is a narrow cobalt rule. It marks the selected section in the index and continues as an underline under the words that triggered a rule. The shortened rule above the decision panel links that action to the evidence. Cobalt is reserved for those marks, primary actions, focus, and progress. Risk levels have separate labelled semantic colors.

| Accent study | RGB reference | Role |
| --- | --- | --- |
| Cobalt | `#173cc9` | Selected. Its distinct hue reads clearly against warm paper and cool ink. |
| Ultramarine | `#343eaa` | More violet. It would make the focus ring less distinct from the darkest ink. |
| Prussian blue | `#224c69` | Lower chroma. It would suit a quieter document archive. |

Source Serif 4 is the display and body voice. Its variable WOFF2 is hosted with the app in six Unicode subsets, with the Latin subset preloaded. IBM Plex Mono is for section labels, keyboard keys and tabular counts. Headings scale with `clamp()` and tighter tracking. Reading text uses 16–18 px at 1.6 line height with a 68-character measure.

The foundations use twelve neutral steps, paired OKLCH and sRGB values, and semantic aliases for each theme. Spacing starts at 4 px. Use 4/8 px inside controls, 12/16 px within rows, 24/32 px between sections, and 16/32/48 px page gutters at 0/640/1100 px. Controls share a 4 px radius. Depth uses an inset edge, a low sheet shadow or a layered preview shadow. Grain is used on the sample's paper surface.

| Foreground / background | Light | Dark |
| --- | ---: | ---: |
| `text-primary` / `bg-panel` | 15.98:1 | 12.96:1 |
| `text-secondary` / `bg-panel` | 8.00:1 | 10.12:1 |
| `text-muted` / `bg-panel` | 5.79:1 | 7.13:1 |
| `text-muted` / `bg-base` | 5.48:1 | 8.32:1 |
| `text-muted` / `bg-hover` | 5.21:1 | 6.02:1 |
| `accent` / `bg-panel` | 8.03:1 | 7.58:1 |
| `on-accent` / `accent` | 8.31:1 | 8.12:1 |
| `ring` / `bg-hover` | 7.23:1 | 6.40:1 |
| `control` / `bg-base` | 3.82:1 | 5.78:1 |
| `risk-critical` / `bg-hover` | 6.35:1 | 6.71:1 |
| `risk-high` / `bg-hover` | 6.13:1 | 7.85:1 |
| `risk-medium` / `bg-hover` | 5.96:1 | 7.72:1 |
| `risk-low` / `bg-hover` | 6.05:1 | 7.61:1 |

Ratios use WCAG relative luminance of the sRGB fallbacks for the corresponding OKLCH values. All sampled text pairs exceed 4.5:1. Focus and control pairs exceed 3:1. Source values are mirrored in [CSS variables](../../../apps/web/src/styles/tokens.css), the [Tailwind theme](../../../apps/web/tailwind.config.js) and [tokens.json](../../../apps/web/tokens.json).

Motion uses transform and opacity with 160 ms presses, 220 ms views and 300 ms progress. Route entry leaves the first paint visible. Filtering the queue can replay row entry. Keyboard changes in the clause index preserve focus. The reduced-motion preference suppresses the movement and delay.

## Routes and workflows

| Screen | Workflow |
| --- | --- |
| Home `/` | Inspect two source excerpts and see why each was flagged. Start a review or read the upload requirements. |
| Sign-in `/login` | Use Google or an email code. Validation and provider errors appear at the form. |
| Ledger `/dashboard` | Choose all contracts, unfinished reviews, decisions recorded or the analysis queue. Search, sort or filter further, inspect progress, and open the contract or delete it. |
| Intake `/upload` | Choose a PDF, DOCX or TXT file of up to 15 MB. See analysis progress and continue into the review on completion. |
| Review `/contract/:id` | Read extracted clauses in document order or open a finding. Search the index, filter by risk or undecided status, and jump to the next undecided clause. A selected clause has an owner-gated URL with its ID. |
| Evidence and decision | Read matched words, explanation and a proposed revision where available. Accept, request revision or escalate. Revisions and escalations require a note. Reviewers can edit or reopen the decision. The Markdown report includes saved decisions and notes. |
| Comparison and chat | Compare two clauses, or ask a question in the existing contract chat. The article action starts the question with the selected clause. |
| Recovery and legal | Missing and broken views offer a way back. Privacy and terms describe what goes into the workspace, what is sent to the configured provider and what contract deletion removes. |

### Architecture

The existing Vite, React, TypeScript and Tailwind SPA fits the authenticated review desk and its deployment. Native form controls and Lucide keep the focus model predictable. Existing email validation uses Zod. The dashboard chart loads with its route. The public sample needs no provider request.

Fastify continues to verify the Supabase token and contract owner. The `clause_review_decisions` table stores at most one current decision per clause, with a composite foreign key for clause membership, note constraints and cascading deletion. The database permits service-role access only. The API stores the decision atomically, returns the saved row, and makes reopen safe to retry. Concurrent updates resolve to the last committed decision. The contract list reports decision counts without returning reviewer notes. Clause pages retain their existing response shapes with an optional decision, and the reader follows pagination up to the 500-clause parser limit.

Supabase Auth, Storage, existing analysis jobs, the ML service and the configured Gemini path remain the operational dependencies. Review decisions use the existing authenticated REST path and need no provider, live collaboration service or new runtime configuration. The app's existing manifest supports install metadata. English is the current copy locale. Dates use the browser locale.

### Run and reproduce

Use Node 24 and Python 3.12. Run from the repository root with the existing [environment template](../../../.env.example) and [local setup guide](../../LOCAL-SETUP.md).

```sh
npm ci
npm run setup:ml
npm run dev:ml
```

Run `npm run dev` in another terminal. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` and `VITE_WS_URL` for the web app. Keep `SUPABASE_SERVICE_ROLE_KEY` and the provider key server-side. Apply [the decision migration](../../../supabase/migrations/20261025000005_clause_review_decisions.sql) before deploying the API that reads it.

```sh
npx playwright-core install chromium
export VITE_SUPABASE_URL=https://dummy.supabase.co VITE_SUPABASE_ANON_KEY=dummy-anon-key
export VITE_API_URL=http://127.0.0.1:9462 VITE_WS_URL=ws://127.0.0.1:9462/ws
npm run build:web
npm run shots -- after apps/web/dist /tmp/auditmind-after
npm run shots -- verify apps/web/dist
```

For the baseline, build merged `main` at `f115ae7244547d055dd227928d2e71ed95c92496` in a separate checkout with the same fixture environment. Run `npm run shots -- before /path/to/baseline/apps/web/dist /tmp/auditmind-before` from the v2 branch. Both use the same synthetic agreements, date and browser. Set `CHROME_BIN` if using an installed Chromium. Database checks use [the disposable PostgreSQL runner](../../../scripts/db/run-isolated.sh).

## Verification

| Check | Result |
| --- | --- |
| Production build | Vite and TypeScript pass. The pre-existing Zod bundle emits a Rollup annotation warning. |
| Node and Python | 3 script, 34 web, 187 API, and 27 Python tests pass. |
| Database | The disposable PostgreSQL 17.12 run passed role isolation, decision updates, clause ownership constraints and cascade cleanup, plus the existing atomic-analysis and durable-job checks. |
| Browser | 53 axe checks with zero violations and no horizontal overflow at 320, 390, 768 and 1440 px. Desktop light and dark and narrow light views passed in Chromium 156. |
| Lighthouse mobile | Performance 100, accessibility 100, best practices 100 and SEO 100. LCP 0.76 s, CLS 0, TBT 11 ms. [Recorded Lighthouse run](lighthouse-mobile.json) |

The browser runner checks the synthetic sign-in, upload, chat, filtering, export and compare workflows. It also checks document navigation, a failed decision save and retry, progress in the ledger, persistence after reload, reopening, and decisions in a downloaded report. Both builds use the same fixtures. [Before and after screenshots](screenshots)

To reproduce the mobile measurement on the built app, start `npm run preview --workspace apps/web -- --host 127.0.0.1 --port 4187 --strictPort` then run:

```sh
CHROME_PATH=/path/to/chromium npx --yes lighthouse@13.6.0 http://127.0.0.1:4187/ \
  --chrome-flags='--headless' --output=json --output-path=/tmp/auditmind-lighthouse.json
```

### Launch checklist

- [x] Verify the locked build and unit, API, Python, database and browser suites.
- [x] Compare the light and dark designs, keyboard flow, contrast and reduced-motion path.
- [x] Verify the local social preview and install metadata in the build.
- [ ] Apply the decision migration to a disposable Supabase project. Run the two-user Auth, Storage and provider-backed upload flow there.
- [ ] Check the deployed host's headers, social preview and policy text with the operator.
- [ ] Check Safari, Firefox and a screen reader. Measure real-device performance after release.

Source Serif 4 is pinned at 5.3.1. Registry checks found newer major releases of React, Vite, Tailwind, Fastify and Recharts. The production dependency audit reports three pre-existing high advisories across Fastify, find-my-way and Zod 3. A dependency upgrade needs its own compatibility and regression run. The new persistence flow has been exercised with local PostgreSQL and synthetic browser services. The deployed Supabase and provider flows remain release checks.

### Follow-up ideas

1. Link extracted clauses to pages in the uploaded document.
2. Compare successive versions of the same clause.
3. Record review history with an author and timestamp per decision.
4. Assign escalations and revision requests to another reviewer.
5. Save common queue views.
6. Add separate report filters for open follow-up actions.
7. Add OCR with a per-page extraction confidence indicator.
8. Make frequent workspace commands available from a keyboard palette.
9. Offer account export and deletion with documented retention.
10. Measure finding quality against a reviewed contract corpus.
