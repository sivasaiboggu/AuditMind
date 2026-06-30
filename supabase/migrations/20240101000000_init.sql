-- Drop existing tables to ensure clean rebuild
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.risk_reports CASCADE;
DROP TABLE IF EXISTS public.clauses CASCADE;
DROP TABLE IF EXISTS public.contracts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.regulation_corpus CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  company_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  overall_risk_score INTEGER DEFAULT 0 CHECK (overall_risk_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clauses table
CREATE TABLE IF NOT EXISTS public.clauses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  number TEXT,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  risk_level TEXT CHECK (risk_level IN ('critical', 'high', 'medium', 'low')),
  risk_explanation TEXT,
  suggested_redline TEXT,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Risk reports
CREATE TABLE IF NOT EXISTS public.risk_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE UNIQUE NOT NULL,
  summary TEXT NOT NULL,
  recommendations JSONB,
  retrieved_precedents JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Regulation corpus (RAG)
CREATE TABLE IF NOT EXISTS public.regulation_corpus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  jurisdiction TEXT,
  embedding vector(768),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_corpus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profiles" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own contracts" ON public.contracts FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can insert own contracts" ON public.contracts FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can delete own contracts" ON public.contracts FOR DELETE USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view clauses of own contracts" ON public.clauses FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.contracts WHERE public.contracts.id = public.clauses.contract_id AND (public.contracts.user_id = auth.uid() OR public.contracts.user_id IS NULL)));

CREATE POLICY "Users can view reports of own contracts" ON public.risk_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.contracts WHERE public.contracts.id = public.risk_reports.contract_id AND (public.contracts.user_id = auth.uid() OR public.contracts.user_id IS NULL)));

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.contracts WHERE public.contracts.id = public.chat_sessions.contract_id AND (public.contracts.user_id = auth.uid() OR public.contracts.user_id IS NULL)));

CREATE POLICY "Users can view messages of own sessions" ON public.chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.chat_sessions 
    JOIN public.contracts ON public.contracts.id = public.chat_sessions.contract_id 
    WHERE public.chat_sessions.id = public.chat_messages.session_id AND (public.contracts.user_id = auth.uid() OR public.contracts.user_id IS NULL)
  ));

CREATE POLICY "Allow public read access to regulation_corpus" ON public.regulation_corpus FOR SELECT USING (true);
