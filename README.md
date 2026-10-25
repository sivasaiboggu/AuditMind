# AuditMind ⚖️

AuditMind is a contract-review prototype. It extracts clauses, applies review rules and connects retrieval and explanation services. Outputs need human review and are not legal advice. Production readiness, legal accuracy and performance improvements have not been established.

---

## 🌟 Key Features

*   **⚡ Real-Time Parallel Pipeline:** Ingests agreements (PDF, DOCX) and processes clauses concurrently. No controlled latency benchmark is included.
*   **🧠 Localized Hybrid Classification:** Uses uncalibrated review rules by default. An explicitly enabled, locally available model with named legal-risk labels may be used; a generic relevance score is never mapped to legal risk.
*   **📊 Interactive Compliance Dashboard:** Displays dynamic risk trends over time and risk allocations directly synchronized with Supabase database events.
*   **🖋️ AI-Powered Proposal redlines:** Offers detailed clause risk explanations and suggested redlines backed by Gemini model reasoning.
*   **🔒 Background Processing:** Uses optional Upstash Redis REST or an in-memory queue. Crash recovery, durable acknowledgement and exactly-once execution are not implemented.

---

## 🏗️ Architecture

AuditMind is built as a TypeScript monorepo containing three core components:

1.  **Vite Client App (`/apps/web`):** A React application styled with high-performance Tailwind CSS and Recharts telemetry graphs.
2.  **Fastify API Server (`/apps/api`):** A Fastify backend using WebSockets (`/ws`) for real-time progress feeds and streaming chat completions.
3.  **Python ML Service (`/apps/ml-service`):** A FastAPI service running token classification models for clause analysis.

---

## 🚀 Setup & Installation

### 1. Prerequisites
Make sure you have installed:
*   [Node.js (v18+)](https://nodejs.org/)
*   [Python (v3.10+)](https://www.python.org/)
*   [Supabase Account & Database](https://supabase.com/)
*   [Upstash Redis Store](https://upstash.com/)

Python commands use the project virtual environment on Windows, Linux, and macOS.
The setup command uses `py -3` on Windows and `python3` elsewhere. Set the `PYTHON`
environment variable to a Python executable path when using a different installation.

### 2. Configure Environment Variables
Put server variables in `apps/api/.env` and only public `VITE_` variables in
`apps/web/.env`. Do not copy server secrets into the web environment:

```env
PORT=3000
SUPABASE_URL=https://<your-project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>

UPSTASH_REDIS_REST_URL=https://<your-redis-id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<your-upstash-token>

GEMINI_API_KEY=<your-google-gemini-key>
ML_SERVICE_URL=http://localhost:8000
```

### 3. Setup Database Schema
The source baseline no longer drops tables, and later migrations no longer add
permissive private-table policies or conflict with the baseline UUID schema.
Use the ordered migrations only in a new disposable project first. Existing
projects need a schema and policy inventory, backup and reviewed additive rollout,
not a blind replay of the baseline. See [database verification](docs/DATABASE-VERIFICATION.md).
No live database migration or policy verification has been performed.

---

## 💻 Running Locally

To start the entire monorepo in developer mode:

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```
2. **Start the applications:**
   ```bash
   npm run dev
   ```
   *   Vite Client: `http://localhost:5173`
   *   Fastify API: `http://localhost:3000`
   *   Start the ML service separately with `npm run dev:ml`: `http://localhost:8000`

Launcher regression tests (no Python package installation needed):
```bash
npm run test:scripts
```

---

## 🛡️ License

This project is licensed under the MIT License - see the LICENSE file for details.

## API authentication and contract access

Contract HTTP routes require `Authorization: Bearer <Supabase access token>`.
The API verifies the token with Supabase Auth and derives the user ID server-side;
a caller-supplied `userId` is not an authentication mechanism. Contract deletion,
clause reads and WebSocket messages also require ownership of the contract.
The web client obtains its current session token and sends it with each request.
WebSocket tokens travel in message frames, not URL query parameters.

Set `FRONTEND_URL` to your exact deployed web origin. Arbitrary `*.vercel.app`
origins are no longer allowed. Local Vite preview/dev origins remain supported.
Deploy the matching web and API changes together; older clients without session
tokens will receive 401 responses. No database migration is part of this patch.

Run the isolated access-control regression suite with `npm run test:security`.
These tests use fake identities/storage, not a live Supabase project. Verify
real sign-in, uploads, progress/chat and two-user isolation in a staging project
before treating the change as end-to-end verified.

### Disposable API ownership checks

The API entry point is separate from `buildApp`, so the actual HTTP and
WebSocket routes can be tested without listening on a public interface or
using a live account. Run after installing dependencies:

```bash
npm run build:api
node --test --test-timeout=10000 apps/api/tests/*.test.mjs
```

The route suite uses an in-memory Supabase-compatible test double with two
synthetic users and two synthetic contracts. It tests verified identity over
caller-supplied user IDs, owner-only lists and clauses, no cross-owner storage
or row deletion, authentication before upload dispatch, denied cross-owner
WebSocket chat, and admitted owner progress subscriptions. It does not prove
Supabase RLS, real token issuance/expiry, production CORS, live Storage or the
ML pipeline. No production credentials, external model calls or migrations are
used by this suite. A two-user isolated Supabase end-to-end check is still
needed before treating the coupled API/client update as deployment-ready.

### Browser-auth and deletion checkpoint

Contract CORS preflight now bypasses bearer verification only for `OPTIONS`;
actual contract requests still require a server-verified token. Synthetic route
tests cover an allowed localhost origin, an untrusted origin and an unauthenticated
actual request. This does not replace an isolated real Supabase/RLS/browser test.

Contract deletion stops before removing metadata when storage deletion fails,
so an unsuccessful cleanup is not reported as success. A later metadata failure
after successful storage deletion can still leave a record pointing to a missing
file: storage and Postgres are not one transaction. Reconciliation and a durable
delete state machine remain future work. Health reports configuration, not an
unperformed database-connectivity check. Provider DB error text is not returned
to the browser. No production records or storage objects were changed in tests.

### Risk-model safety checkpoint

The previous default MS MARCO relevance model was not a legal-risk classifier. Its
confidence must not be turned into a risk tier. The service now starts in explicit
heuristic-review mode, without a model download. `ENABLE_RISK_MODEL=true` and
`MODEL_NAME` are opt-in settings for an already-local, reviewed classifier declaring
exactly `low`, `medium`, `high`, `critical` labels. Configuration labels are a
compatibility guard, not proof of training or accuracy. No fine-tuning or model
quality is claimed by this change. Model and rule responses expose `method` and
`calibrated: false`; existing numeric confidence values are uncalibrated scores.
The API also rejects invalid labels, non-finite/out-of-range scores, and preserves
a valid zero confidence instead of inventing 0.85.

Run offline model-boundary regressions with:
`python3 -m unittest discover -s apps/ml-service/tests -v`
(the six HTTP service tests require FastAPI, uvicorn and httpx; they skip
explicitly without those packages, while five pure rule tests still run)
and `npm run test:security`. No external model calls, cloud accounts or migrations.


### Upload and deletion recovery checkpoint

Deletion now blocks processing contracts and missing stored paths, avoiding a
race with the active pipeline or a metadata-only deletion. If Storage succeeds
but metadata deletion fails, the API returns `METADATA_CLEANUP_PENDING` with an
explicit retry message. This is not a distributed transaction or a durable
cleanup queue. Already-absent-object retry behavior remains to be verified with
real isolated Supabase Storage; the route tests use a synthetic store.

When upload metadata receives a definite PostgreSQL statement rejection (SQLSTATE
classes 22, 23 or 42), the API attempts cleanup of only its newly generated
object path. It reports `UPLOAD_ROLLED_BACK` or `UPLOAD_CLEANUP_PENDING`, with a
recovery contract ID. Ambiguous insert errors retain the file and report
`UPLOAD_ACCEPTANCE_UNKNOWN`: a network error does not prove an insert failed.
Ambiguous queue acceptance similarly returns `QUEUE_ACCEPTANCE_UNKNOWN`, retains
the file/record, and does not automatically dispatch a duplicate. Operators must
inspect the recovery ID before retrying. No automatic reconciliation, durable
outbox, exactly-once queue guarantee or production validation is claimed.


### Incomplete analysis is not low risk

A clause-service exception no longer creates a low-risk clause with score zero.
The run fails before clause insertion, and empty extraction or a missing storage
client cannot report completion. Failure progress messages do not expose raw
provider errors. Six synthetic worker tests cover these paths and successful
persistence. This is not proof of legal accuracy: heuristic/static fallbacks
inside individual providers still need separate review. The worker currently
removes a Redis job before processing and has no durable acknowledgement/retry
protocol. Crashes and partial database writes still require reconciliation.


### Unavailable explanation service

Offline/error explanation fallbacks return an explicit unassessed notice and
leave the original clause text unchanged. They no longer infer broad indemnity,
a three-month liability cap or a safer redline from a title. Offline chat does
not invent default terms or references to nonexistent sections. Four offline
provider tests cover those examples; no legal assessment quality is established.


### Regulatory retrieval provenance

Missing/failed embeddings now return no vector, not 768 fabricated zeros. Vector
errors can fall back to keyword search of the configured corpus. With no corpus,
no match, malformed rows or failed retrieval, the explanation receives an explicit
absence notice, never canned UCC/GDPR excerpts or an uncited indemnity rule.
Retrieved excerpts disclose that currency and applicability are unverified. Six
offline regressions cover this boundary; no live corpus or legal validation is
claimed. Corpus curation, citations, jurisdiction and source freshness remain
required before anyone relies on regulatory output.


### Document parsing boundary

Uploads accept PDF, DOCX and UTF-8 plain text. Legacy binary DOC was previously
passed to the DOCX-only extractor and is now explicitly rejected with other
unsupported types before storage. Corrupted PDFs fail extraction instead of
scanning their binary object strings and presenting those fragments as document
text. Empty/scanned PDFs require readable text or prior OCR; OCR is not included.
Five offline parsing/upload regressions cover these cases. Valid real-world PDF
and DOCX fidelity still needs representative document testing.


### Clause text preservation

Segmentation keeps the original heading and same-line text inside each analyzed
clause. Short provisions and header-only sections are no longer silently filtered
out. Numbered single-level headings are supported, while ordinary "I agree" and
prefix-lookalike lines are not treated as Roman headings. Five synthetic tests
cover these cases. This is a heuristic segmenter, not a guarantee of legal-document
structure fidelity. The API's offline classification rules now also identify their
method and explicitly mark confidence as uncalibrated.


### Chat context boundary

Chat requires a completed owned contract and a successful nonempty clause read.
A failed context query no longer falls through to an ungrounded provider call.
History is bounded to40 user/model messages,8,000 characters per message and
32,000 total characters. Five synthetic WebSocket regressions cover blocked and
admitted paths. This does not validate model answers or supply a full rate limit,
prompt-injection defense or legal review.


### Pipeline result boundaries

Before persisting a clause, the worker checks its known risk label, finite 0-100
priority score, nonempty explanation and string redline. Malformed service output
fails the run before clause insertion instead of producing a completed result
with null, non-finite or invented values. A real zero score remains valid.
Fifteen isolated worker tests cover these boundaries. This is not legal accuracy
validation, live provider/database verification, or a transactional retry/outbox
implementation; partial-write recovery remains separate.

### Chat stream integrity

The API explicitly requests SSE and decodes complete JSON events with a streaming
UTF-8 decoder. Split network chunks, escaped quotes, line breaks and Unicode no
longer rely on regex matching or dropped buffer tails. Empty/malformed streams,
stream errors and events over 1 MiB fail instead of reporting completed output.
Once an answer has started, an interrupted stream is reported as incomplete;
local-search fallback is not appended to a partial AI answer. Provider request
objects are not logged on that failure path. Eight isolated decoder regressions
cover these cases, without provider calls. Live provider behavior and legal
accuracy remain unverified.

### Interrupted chat in the client

WebSocket errors, closure and failed authenticated sends release the pending
chat state. The latest user question stays visible; its unfinished assistant
placeholder is replaced with an explicit incomplete-answer notice, not trusted
partial legal text. Incomplete notices are excluded from later model history.
The response handler is installed before sending and updates current state,
not the stale pre-question snapshot. Three isolated state-helper tests and a
synthetic local desktop rendering cover the notice/history behavior. No live
provider, authenticated Supabase session, or full reconnect flow was verified.

### Contract-view context ownership

Switching the active contract clears the prior clauses, report, chat, session and
progress before loading the new document. A metadata refresh for the same ID
keeps its chat. Route loads ignore results after cleanup, including delayed JSON
parsing, and empty clause responses clear the selection. Six isolated store and
route-effect tests cover these boundaries. This is not account-wide auth-store
clearing, live Supabase verification, or durable per-contract chat storage.

### Auth ownership transitions

Changing the authenticated user clears the private in-memory workspace before
profile lookup. Profile and initial-session responses are guarded by an auth
epoch so late results cannot restore a signed-out/previous user's profile.
Logout clears workspace state locally before the remote sign-out. Configured
Supabase auth never restores a demo localStorage identity and rejects demo login
bypass; demo login remains available only without configured auth. Six isolated
auth/store regressions cover these transitions. This is not full cross-account
isolation proof: live auth/RLS behavior and
other asynchronous consumers still need their own checks.

### Client ownership and lifecycle verification

Private browser work is scoped to a workspace epoch, not only a user ID. Logout
and owner changes invalidate pending token lookups, list/clause JSON responses,
upload timers and chat/upload socket handlers, including A-to-B-to-A switches.
Protected views remount when the owner changes. Dashboard refreshes also reject
older overlapping reads. Uploads interrupted after acceptance direct the user
back to the dashboard rather than implying that the server job was cancelled.
The regression suite exercises these with synthetic sessions, deferred responses
and sockets. It is not evidence of real Supabase sign-in, RLS, Storage, Redis
recovery, provider accuracy or deployed browser isolation.


### October 25 remaining-issues review

The contract screen now stacks its clause and detail panels on narrow viewports;
synthetic desktop and 390px browser checks found no horizontal overflow. Navigation
returns to the active contract instead of the upload page. Empty or failed clause
loads no longer imply analysis is still running, and a completed analysis is labeled
ANALYZED rather than VERIFIED. Offline explanation calls now fail the pipeline
instead of completing with unassessed fallback text. Partial clause rows are not
served by the API while their contract is incomplete.

Database source policies and migration consistency were repaired and all four SQL
files passed PostgreSQL grammar parsing. This is not a database execution test.
The rollout gate and actual two-user checks are in `docs/DATABASE-VERIFICATION.md`.
No live policies, Storage bucket, credentials, deployments or provider settings
were changed. Durable queue recovery, live auth/RLS/Storage/Redis integration and
legal/corpus evaluation remain unfinished, so this is not an all-fixed release.

### Atomic persistence source checkpoint

The worker now calls a service-role-only transactional analysis commit RPC, which
locks the contract and saves clauses plus completion together. Re-delivery after
completion is a no-op. The required additive migration is checked in and passed a disposable local
PostgreSQL core transaction/RLS test, but has not been applied to any live project. Deploy the API only after the disposable-project
acceptance checks and reviewed migration rollout. An ambiguous RPC response is
reported as unconfirmed and is not forced into failed status. Provider fan-out is
bounded to four clauses per batch; failed batches settle before terminal progress.
WebSocket progress supports multiple tabs, rejects account changes on the same
socket, and closes overlapping requests rather than mixing two chat streams.
Redis job delivery and restart recovery remain unfinished independently of atomic
result persistence.


Core database verification can be repeated with `scripts/db/run-isolated.sh`.
Actual local PostgreSQL assertions cover late-failure rollback, valid commit,
re-delivery, concurrent callers, role privileges, two-owner RLS and write denial.
The harness excludes pgvector/corpus and uses synthetic auth.uid, so real Supabase
Auth/Storage and full migration rollout checks remain open. See the verification
document for dependencies and exact limits; do not deploy this API on an old schema.


### Durable job ledger (supersedes Redis/memory queue descriptions above)

Contract metadata now includes its MIME type. A database trigger inserts a private
job row in the same transaction, closing the metadata-to-enqueue crash window.
The worker claims a two-minute lease, downloads the original private Storage file,
renews while processing, and commits output plus job completion in one transaction.
Expired leases are reclaimed; stale workers cannot commit or fail a newer attempt.
Redis and in-memory queue delivery are no longer used. Existing Redis payloads are
not automatically migrated or replayed. Old processing contracts without MIME/job
metadata need an operator-reviewed inventory, not guessed file types or blind retry.

Required rollout order: verify and apply all reviewed additive migrations through
`20261025000003_bounded_job_retries.sql` before this API. Never deploy the API
independently on the old schema. No live migration, backfill, replay or deployment
has been performed. Disposable PostgreSQL tests cover the outbox, lease expiry and
fencing, atomic completion, cleanup and persistence through an immediate restart.
This does not verify real Storage downloads, Supabase/network behavior or provider
quality. Transient download failures stay recoverable after expiry and need
operational visibility; retries can repeat provider work, although result writes
are fenced. Operators must review old jobs/files before any live rollout.

### Bounded recovery and failure visibility

The source API requires migrations through
`20261025000003_bounded_job_retries.sql` before rollout. Storage-retrieval retries
now back off for 30/60 seconds and stop at three claimed attempts, including crash
re-deliveries. The dashboard shows owned job attempt counts, upcoming retries,
analysis failure and exhausted recovery without exposing raw provider errors.
A lost heartbeat prevents further output/status writes; lease tokens remain the
database commit fence. Disposable PostgreSQL tests verify backoff/cap behavior.
No live service or database was changed, and no replay/admin endpoint is exposed.

### Upload acceptance follow-through

The upload page preserves server recovery IDs and pauses another upload after an
ambiguous response or transport interruption, with a dashboard recovery action.
Authentication failures before fetch are marked not-sent, not uncertain acceptance.
Definite rejections remain retryable. Local validation and the picker now agree
on nonempty PDF/DOCX/TXT and the 15MB limit. The dashboard has an explicit Refresh
action for current owned status when realtime delivery is unavailable, without
adding account polling. Synthetic desktop/390px screenshots and regression tests
cover the uncertain-response state; no real upload or provider call was performed.
