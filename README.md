# AuditMind ⚖️

AuditMind is an enterprise-grade, high-performance legal contract compliance and risk assessment platform. By combining hybrid RAG (Retrieval-Augmented Generation), localized Transformer models, and advanced LLM reasoning, AuditMind ingests legal agreements, extracts clauses, classifies risk, and matches compliance standards in real time.

---

## 🌟 Key Features

*   **⚡ Real-Time Parallel Pipeline:** Ingests agreements (PDF, DOCX) and parses clauses concurrently, reducing processing latency by 90% (2–4 seconds per document).
*   **🧠 Localized Hybrid Classification:** Classifies risk levels (Low, Medium, High, Critical) using local BERT-class models with heuristic-based rule fallbacks for offline resilience.
*   **📊 Interactive Compliance Dashboard:** Displays dynamic risk trends over time and risk allocations directly synchronized with Supabase database events.
*   **🖋️ AI-Powered Proposal redlines:** Offers detailed clause risk explanations and suggested redlines backed by Gemini model reasoning.
*   **🔒 Secure In-Memory Queue:** Integrates a background queue powered by Upstash Redis (REST) and in-memory event polling loops for reliable task queue execution.

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
Execute the SQL migration scripts in your **Supabase SQL Editor**:
1. Copy the contents of [`supabase/migrations/20240101000000_init.sql`](supabase/migrations/20240101000000_init.sql).
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
