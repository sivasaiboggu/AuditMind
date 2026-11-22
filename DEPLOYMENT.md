# AuditMind — Deployment Guide

## Before deploying the API
Apply the ordered migrations in `supabase/migrations/` through
`20261025000004_clause_matched_terms.sql` in a disposable project first
(see `docs/DATABASE-VERIFICATION.md` and
`scripts/db/run-isolated.sh`). Never deploy the API on an old schema:
the pipeline stores matched evidence words with each clause and the
commit RPC expects the column. No live migration has been performed.

## Deploy Frontend to Vercel
1. Import this repository into Vercel.
2. The root `vercel.json` automatically handles build settings.
3. Configure environment variables in the Vercel Dashboard.

## Deploy API to Railway
1. Create a new project in Railway.
2. Point to the `apps/api` directory.
3. Set `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
