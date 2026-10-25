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
Create an `.env` file in the root directory (and copy it to `/apps/api/.env` and `/apps/web/.env`):

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
**Warning: the initial schema script contains `DROP TABLE` statements. Use it only
in a new disposable Supabase project, never against existing data. Review every
later migration separately. Back up existing projects and design a non-destructive
migration before making changes.** No production migration has been run.

For a new disposable project only:
1. Review the contents of [`supabase/migrations/20240101000000_init.sql`](supabase/migrations/20240101000000_init.sql).
2. Run them in your Supabase project to build the `contracts`, `clauses`, and RLS policy configurations.

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
