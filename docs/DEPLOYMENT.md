# AuditMind Deployment Guide

This document outlines the hosting architecture and environment configs for deploying AuditMind to production.

---

## 1. Hosting Architecture

AuditMind is designed as a distributed monorepo hosted across three cloud platforms:
- **Frontend (React + Vite):** Hosted on **Vercel**
- **Orchestration API (Fastify Node):** Hosted on **Railway**
- **Legal-NLP Service (FastAPI Python):** Hosted on **Render** (CPU-instance scale)
- **Database & Storage:** Hosted on **Supabase** (Postgres + pgvector + Auth + Storage Buckets)
- **Background Queue:** Hosted on **Upstash Redis** (or a Redis instance on Railway)

---

## 2. Environment Variables Configuration

Ensure the following variables are configured on each target platform:

### 2.1. React Frontend (Vercel)
- `VITE_SUPABASE_URL`: Your Supabase project URL (from project settings API tab).
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous public key.
- `VITE_API_URL`: The URL of your deployed Railway Fastify API (e.g. `https://auditmind-api.up.railway.app`).
- `VITE_WS_URL`: The WebSocket protocol URL matching your API (e.g. `wss://auditmind-api.up.railway.app`).

### 2.2. Fastify Node API (Railway)
- `PORT`: `3000` (Fastify listening port).
- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service role secret key (required to bypass Row-Level Security for ingestion writing).
- `REDIS_URL`: Connection string to your Redis database (e.g., `redis://default:password@host:port`).
- `GEMINI_API_KEY`: Google AI Studio API Key (used for `text-embedding-004` and `gemini-2.5-flash`/`pro`).
- `ML_SERVICE_URL`: The URL of your deployed Render Python microservice (e.g. `https://auditmind-ml.onrender.com`).

### 2.3. Python ML Service (Render)
- `MODEL_NAME`: The Hugging Face model identifier for clause classification (defaults to `cross-encoder/ms-marco-MiniLM-L-2-v2`).
- `PORT`: `8000` (FastAPI uvicorn port).

---

## 3. Database Schema & Storage Setup

1. **Database Schema:**
   - Log into your Supabase control panel.
   - Go to the **SQL Editor**.
   - Copy the contents of `supabase/migrations/20260630000000_init_schema.sql` and run them to initialize tables, pgvector configurations, indices, and RLS policies.

2. **Embedding Seed Data:**
   - Run the seed script to fill the regulatory vector corpus table:
     ```bash
     npm run seed --workspace=supabase
     ```

3. **Storage Bucket Config:**
   - Go to **Storage** inside Supabase dashboard.
   - Create a new bucket named `contracts`.
   - Toggle **Public** to `OFF` (AuditMind mandates signed URLs for document access, securing legal files).
