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
   *   FastAPI ML: `http://localhost:8000`

---

## 🛡️ License

This project is licensed under the MIT License - see the LICENSE file for details.
