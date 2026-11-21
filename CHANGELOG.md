# Changelog
All notable changes will be documented here.

## Unreleased
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
