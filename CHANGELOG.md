# Changelog
All notable changes will be documented here.

## Unreleased
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
