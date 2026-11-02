# Deploying the AuditMind API on Render (free web service)

The API no longer runs on Railway (trial expired; the old service URL returns
Railway's "Application not found"). This guide deploys the same Fastify API to
a Render free web service. Read the limits first:
https://render.com/docs/free

## Free-tier limits that apply

- 512 MB RAM / 0.1 CPU per instance.
- Spins down after 15 minutes without traffic; the next request waits about a
  minute while it starts. WebSocket progress updates reconnect after startup.
- 750 free instance-hours per workspace per month, shared across every free
  service in the workspace. An idle, spun-down service does not consume hours.
- Outbound SMTP ports are blocked, and the filesystem is ephemeral - uploads
  and analysis state live in Supabase, which stays the system of record.

## What the API needs at runtime

- Node web service (this repo, `npm run build:api` then `npm run start:api`).
- Supabase project (database, storage, and the durable contract_jobs ledger -
  no Redis is needed; the database is authoritative).
- `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` set as secret
  environment variables in the Render dashboard.
- `FRONTEND_URL` set to the deployed web app origin so CORS admits it.
- `ML_SERVICE_URL` optional; without it the API classifies clauses with the
  rule-based fallback in `apps/api/src/services/ml.ts`.

## Steps

1. Push this repo (render.yaml is included) and in Render choose
   New > Blueprint, or create a Web Service manually with the same settings.
2. Fill the secret environment variables when prompted.
3. After the first deploy, set the frontend's `VITE_API_URL` and
   `VITE_WS_URL` to the new service URL and redeploy the frontend.
4. Verify `https://<service>/health` reports status "healthy" and then run a
   small contract upload end to end.

Do not apply database migrations blind: supabase/migrations are source-only
and say "apply after isolated verification and reviewed rollout, before API".
Confirm the live project already has contract_jobs and its RPC functions
before relying on them from the new service.
