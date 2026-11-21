# Changelog
All notable changes will be documented here.

## 1.0.5 — 21 Nov 2026
- Patch release (1.0.5): premium UI pass (round 8) plus a senior logic
  review. Full suites re-verified: API 172 passed, ML 24 passed
  (+61 subtests), web 18 passed, scripts 3 passed, 0 failed.
- Logic fix: `countByRisk` (and the contract view's inline copy of it)
  counted clause risk levels with `in` / direct indexing on a plain
  object, so an unexpected level from the API such as "toString" was
  counted as the string `function toString() { [native code] }1` instead
  of being ignored. The counter now guards with hasOwnProperty, the
  contract view reuses the one tested helper, and the report summary
  cannot be corrupted this way.
- Logic fix: the dashboard "High Risk" card counted contracts of any
  status while captioning itself "of N analysed". A processing or failed
  contract must never count even if it ever carries a score; the card
  now uses a tested `countHighRiskCompleted` helper (completed analyses
  only). The score chip's colours also go through the single `riskBucket`
  function now, so the 75/50/25 thresholds cannot drift apart again.
- Logic fix: with `prefers-reduced-motion` the landing and login canvases
  draw one static frame, but resizing the window clears the canvas and
  nothing redrew it — the background went blank. A resize now redraws
  that one frame; when animating, the running loop repaints as before.
- UI: the OTP field now requests the numeric keyboard and SMS one-time-code
  autofill (`inputMode="numeric"`, `autoComplete="one-time-code"`).
- UI: the chat code called an interrupted answer "Local Search Mode" in a
  variable name; it is now honestly named `isIncomplete` (label and
  styling unchanged).
- UI: `index.html` referenced `/og-image.png` for social shares, but no
  such file was ever in the repo — shares got a 404. The tag is removed
  until a real 1200x630 asset is added.

## 1.0.4 — 21 Nov 2026
- Patch release (1.0.4): premium UI pass (round 7) plus a senior logic
  review. Full suites re-verified: API 172 passed, ML 24 passed
  (+61 subtests), web 14 passed, scripts 3 passed, 0 failed.
- Logic fix: the risk-trend chart plotted 0 for months with no completed
  contracts, reading as "zero risk" instead of "no data". Months with no
  completions now leave a gap (null), and the trend/distribution builders
  moved into a tested pure module (`apps/web/src/lib/dashboard.ts`).
- Logic fix: the pipeline computed and stored a per-clause risk score and
  averaged it into the contract score, but the clauses endpoint never
  returned it — the review UI could only show the tier. The endpoint now
  returns `riskScore` when a valid score is stored (omitted, never a
  fabricated 0, when none is), and clause cards and the analysis panel
  show it.
- Logic fix: a stored clause with a NULL number crashed clause sorting
  and took the whole clause list down with a 500. The commit check never
  required `number`, and the column is nullable, so unnumbered rows now
  sort first instead of throwing.
- Chat: a dropped WebSocket used to leave chat unusable until a full page
  reload. The footer now offers a Reconnect button that re-runs the
  socket setup in place.
- Upload: picking the same file again after a rejection was silently
  ignored because the file input was never reset. It is now.
- UI: stat cards state their denominator ("of N analysed"); charts say
  plainly when there are no completed analyses yet instead of rendering
  empty axes.

## 1.0.3 — 21 Nov 2026
- Patch release (1.0.3, 21 Nov 2026): premium UI pass (round 6) plus a
  senior logic review. Full suites re-verified: API 169 passed, ML 24
  passed (+61 subtests), web 7 passed, scripts 3 passed, 0 failed.
  No dependency updates were available at patch/minor level (all
  newer releases are majors, deliberately not taken).
- Logic fix: Gemini chat sent two consecutive user-role turns (system
  prompt, then the first user message), which the provider rejects with
  a 400 — every chat opened this way. The prompt now folds into the
  opening user message; the old test asserted the broken shape and now
  asserts strict role alternation.
- Logic fixes: ProcessingProgress gains the 'pending' upload stage it
  already used via `as any`; copy buttons only show the checkmark when
  the clipboard write really worked; the dashboard "High Risk" card
  counted >= 70, matching neither the chart's critical bucket (>= 75)
  nor its label — it now counts the chart's high + critical buckets.
- Login canvas now matches the landing canvas: theme tokens cached on
  theme change, one static frame under reduced motion, skipped below
  4 cores. The `animate-fade-in` class the upload banner used was
  never defined; it now exists. Invalid `z-1` classes fixed to `z-[1]`.
- Dead code removed: 15 unused hooks, helpers.ts, unused utils, the
  unreferenced Vite template files, the '.doc' extension the API
  rejects, and a support email with no inbox behind it. The store's
  activeReport/activeSessionId were NOT removed: the workspace-clearing
  tests require switching contracts to clear them, and zustand setState
  can still set them, so dropping them from the clearing logic would
  leak one contract's report/session into the next. Only the unused
  addChatMessage setter went.
- UI: theme elevation tokens (--shadow-card/--shadow-lift) and a shared
  focus-ring token; fluid display type; solid primary button with white
  text in both themes; cards at 12px radius with card shadow; pill
  badges; restrained lift-on-hover; keyboard-hint chips.
- Landing: icon tiles on feature cards, honest footer with the real
  version ("AI output needs legal review"), no copy changes.
- Contract view: compare tab gains a verdict strip derived from the
  two clauses' own risk levels; suggested revision gets a copy button;
  '/' focuses clause search, Escape clears it, with a visible hint row.
- Versions no longer drift: the API health endpoint reads its version
  from apps/api/package.json (it hard-coded 1.0.0), the ML service uses
  one APP_VERSION constant, and the web footer shows APP_VERSION.
- Patch release (1.0.2, 21 Nov 2026): dependency patch/minor updates
  only plus honest landing copy and a small canvas fix. Full suites
  re-verified: API 169 passed, ML 24 passed (+61 subtests), web 7
  passed, scripts 3 passed, 0 failed.
- Landing copy now matches the service: risk scoring is validated
  review rules by default (optional local classifier), RAG cites only
  a configured corpus, and the "View Demo Report" button — which led
  to /login with no demo behind it — is now "See how it works",
  scrolling to the features section.
- Landing canvas reads theme tokens only on theme change instead of
  every animation frame, and draws a single static frame when
  prefers-reduced-motion is set.
- Patch release (1.0.1, 21 Nov 2026): no feature changes. This repo has
  no Dockerfiles, so there was nothing to build-test. Full suites
  re-verified: API 169 passed, ML 24 passed (+61 subtests), web 7
  passed, 0 failed.
- One-click report export: the contract view can download a Markdown risk
  report (overall score, per-level counts, every clause with its text,
  risk explanation and suggested revision, plus a "not legal advice"
  note) built only from the contract's own analysed data.
- Clause compare: pick any two clauses to view them side by side with
  their risk level, explanation, suggested revision and next steps.
- Clause search and risk filter chips on the review panel, with a live
  "X of Y clauses" count, plus Arrow Up / Arrow Down keyboard navigation
  through the filtered list.
- Each clause analysis now ends with a "What to do next" box: general
  next steps for its risk level, labelled as guidance rather than legal
  advice.
- Clause lists now order naturally by clause number ("Section 2" before
  "Section 10", Roman numerals by value, Preamble first) instead of the
  database's lexicographic text order, which also sliced paginated
  results on the wrong order. Chat context uses the same order.
- Dark theme primary text brightened from zinc-400 to zinc-200 for
  readable body contrast on the near-black background.
- Fixed two no-op `w-4.5 h-4.5` classes (not in Tailwind v3's spacing
  scale) on the landing shield icon and the upload back button; both
  now render at the intended 20px size.
