# AuditMind review desk

AuditMind helps a reviewer find the clauses to read first, check the words behind a result, and keep a record of the review. The layout takes its cues from a marked-up agreement and a document register. The margin bracket is the recurring mark. The first useful action for a visitor is reading the sample finding on the home page, which takes no account setup. The time to analyze a new upload depends on its file and the service.

## Applied screen plan

| Route or view | Layout and rationale | States and actions |
| --- | --- | --- |
| `/` Home | A large headline and a live HTML specimen share the top spread. A short index underneath explains the workflow. | Sample clause with inline evidence, upload formats, what the analysis needs, start a review, sign in, and theme control. |
| `/login` Sign-in | A left-hand heading and practical prep note face a compact form. Labels stay tied to their fields. | Email and Google entry, six-digit verification, validation, busy and error responses, and local demo entry when Supabase is absent. |
| `/dashboard` Contracts | A ruled totals strip leads into the register beside a narrower risk overview. File names take precedence over analytics. | Loading, unavailable and empty results, search, status and risk filters, sort, refresh, analysis notices, inline delete confirmation and links to completed reviews. |
| `/upload` Intake | A clearly bounded file target and a side note put format and OCR requirements next to the action. | Keyboard-accessible picker and drag and drop, validation, pending transfer, server progress, interrupted or unconfirmed results, and automatic opening of completed review. |
| `/contract/:id` Analysis | A narrow, scrollable index keeps the original clause and finding in a wider reading pane. | Search, risk filtering, focus-scoped keyboard shortcuts, matched words when present, the saved score, explanation, suggested revision, copy, next step and report export. |
| Comparison | Two clause excerpts share one view, with an explanation of the relative risk above them. Columns stack on narrow screens. | Pick two clauses, replace a selected clause, clear selection, and return to analysis or chat. |
| Chat | The selected clause is named above a source-oriented transcript and a single question field. | Connected and offline states, streaming responses, incomplete answers, copy and reconnect. |
| Unmatched route and render error | The same typography and spacing make the recovery action clear. | Back and contracts links for missing routes. Reload and contracts links for a render error. The static SPA host supplies the shell for unknown routes. |
| `/privacy`, `/terms` | Short public pages show factual workspace and software terms. | Processing and storage disclosures, permissions for uploaded files, legal-review guidance and the software license. |

## Implementation and review

Vite, strict TypeScript, React, React Router and Tailwind fit the existing SPA and deployment. The review routes load on demand. Migrating to Next.js would change how the app deploys and signs in. Native links, buttons, inputs, selects, lists and disclosures cover the interactions in this release. Zod Mini validates sign-in with the existing Supabase methods.

Supabase still owns authentication, account data, documents and database records. Fastify serves the contract and clause reads, manages upload and deletion, and streams status and chat over WebSockets. The ML service and configured Gemini provider still perform their existing parts of analysis. A contract owns its clauses and durable job. A clause can include a score, matched terms, explanation and suggested revision. See the [schema](../schema.md) and [architecture](../ARCHITECTURE.md).

- **Tokens.** Kept one accent hue and moved risk meanings into labelled semantic colors. Shadow is reserved for surfaces that need depth.
- **Controls.** Replaced small pill controls with ruled rows and native fields. Made delete confirmation an independent action beside the contract link.
- **Landing and sign-in.** Replaced general product claims with a sample from a synthetic contract and concrete input requirements. Authentication errors stay beside the form.
- **Workspace.** Moved the register ahead of charts. Removed the duplicated score and retained dates, job status, and monthly values in accessible text. Mobile reading uses a stacked index and an explicit jump to detail.
- **Final pass.** Fixed visible-name mismatches and definition-list markup identified by axe. Checked deep SPA URLs and both theme palettes. The public manifest and icon assets support browser installation. Private contract data stays in the authenticated app, with no service-worker cache.

English is the current locale. Dates use the browser locale, and copy is organized by route. A translation catalog and right-to-left audit would be needed for a localized release.

## Run it

From the project root with Node.js 24 and Python 3.12:

```sh
npm ci
npm run setup:ml
npm run dev:ml
```

Run `npm run dev` in a second terminal. Use [the existing environment template](../../.env.example) and [local setup guide](../LOCAL-SETUP.md). Frontend settings are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` and `VITE_WS_URL`. Authentication service keys and the Gemini key belong to the API environment. An unconfigured build can open the local demo. It needs a configured workspace to analyze a file.

The lockfile pins installs. New frontend dependencies are Bricolage Grotesque 5.3.0, IBM Plex Mono 5.3.0, Zod 4.6.7 and React Router DOM 7.18.6. Browser tooling uses Playwright Core 1.65.1, axe-core for Playwright 4.14.0 and ws 8.21.0. The compatible installed versions of the remaining frontend dependencies are recorded in `package-lock.json`. The registry check identified newer major versions of Vite, React, Recharts and Tailwind. Those migrations would expand the scope of this change.

### Reproduce browser evidence

```sh
npx playwright-core install chromium
export VITE_SUPABASE_URL=https://dummy.supabase.co VITE_SUPABASE_ANON_KEY=dummy-anon-key
export VITE_API_URL=http://127.0.0.1:9462 VITE_WS_URL=ws://127.0.0.1:9462/ws
npm run build:web
npm run shots -- after apps/web/dist docs/redesign/screenshots
npm run shots -- verify apps/web/dist
```

Pass `CHROME_BIN` to use an existing local Chromium. To capture the old UI, build commit `c7fd2ce` in a separate checkout with the same fixture environment above. From the new branch, run `npm run shots -- before /path/to/old/apps/web/dist docs/redesign/screenshots`. The runner uses the same synthetic fixture, date and viewport for both commits and covers the analysis, comparison and chat views independently. Production services receive none of the fixture traffic.

## Verification

| Check | Result |
| --- | --- |
| Production frontend build | Passed with strict TypeScript and Vite |
| Node scripts, web and API suites | 3, 30 and 184 tests passed |
| Python analysis suite | 27 tests passed |
| Isolated PostgreSQL 17 | Passed atomic commits, concurrent retries, owner scope and lease recovery |
| Chromium and axe | Passed at 1,440, 390 and 320 px with zero violations in the audited views. Desktop also passed in dark mode. |
| Lighthouse 13.6, mobile landing | Three isolated runs scored 98–99 performance, 100 accessibility, 100 best practices and 100 SEO. Median LCP was 0.76 s. A concurrent run scored 88 performance. |

The browser checks cover email/code validation, login, filtering and sorting, delete confirmation, clause keyboard controls, export, comparison, streaming chat, upload validation and upload-to-review navigation. Auth, API and chat use synthetic fixtures. The production build reports a Rollup annotation warning in Zod Mini's upstream source.

## Launch checklist

- [x] Verify locked web and API builds and the project’s automated suites.
- [x] Review paired 1440 px desktop, 390 px mobile and dark-theme screenshots.
- [x] Check keyboard controls, focus, responsive overflow, color contrast and the reduced-motion path.
- [x] Verify the public social preview file, manifest and sitemap are present in the build.
- [ ] Check the deployed social image and SPA routing on the chosen production host.
- [ ] Run the real sign-in, upload, deletion, report and chat flows against an isolated Supabase project and configured provider before a release.
- [ ] Confirm deployment-owner privacy/terms wording, provider data retention and any required production security headers.
- [ ] Run VoiceOver or NVDA, Safari and Firefox checks, then collect real-device performance on the preview.

### Risks before release

The browser suite uses synthetic services. Local Lighthouse and axe measure the tested build and browser, so the deployed host and assistive technology still need a pass. The dependency audit identifies pre-existing Fastify and API Zod advisories that require coordinated backend upgrades. The static SPA's missing-page view displays on an HTTP 200 fallback unless the host handles the status separately.

### V2 ideas

1. Link each extracted clause back to its page in the original document.
2. Save a reviewer’s decision and rationale next to a finding.
3. Track edits and compare two versions of an agreement.
4. Let reviewers assign or resolve follow-up actions.
5. Export an annotated report with links to source clauses.
6. Add filtered register views for recurring review queues.
7. Add an OCR path with page-level extraction confidence.
8. Build a keyboard command menu for frequent workspace actions.
9. Add account data export and deletion with clear retention rules.
10. Evaluate explanation quality against a reviewed corpus and measure agreement with reviewers.
