# AuditMind — Deployment Guide

## Deploy Frontend to Vercel
1. Import this repository into Vercel.
2. The root `vercel.json` automatically handles build settings.
3. Configure environment variables in the Vercel Dashboard.

## Deploy API to Railway
1. Create a new project in Railway.
2. Point to the `apps/api` directory.
3. Set `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
