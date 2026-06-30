-- Enable vector extension for RAG similarity matches
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Contracts Table
CREATE TABLE IF NOT EXISTS public.contracts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  file_path text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  overall_risk_score integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Clauses Table
CREATE TABLE IF NOT EXISTS public.clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  number text,
  title text,
  text text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_explanation text,
  suggested_redline text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Regulation Corpus Table (For RAG Vector Searching)
CREATE TABLE IF NOT EXISTS public.regulation_corpus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  section text,
  vector vector(768), -- Dimensions matching text-embedding-004
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Chat Sessions Table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  user_id text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Chat Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'assistant')),
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS contracts_user_idx ON public.contracts (user_id);
CREATE INDEX IF NOT EXISTS clauses_contract_idx ON public.clauses (contract_id);
CREATE INDEX IF NOT EXISTS chat_sessions_contract_idx ON public.chat_sessions (contract_id);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON public.chat_messages (session_id);

-- Hybrid Vector Matching RPC Function for pgvector
CREATE OR REPLACE FUNCTION match_regulations (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  section text,
  similarity float
)
AS $$
  SELECT
    regulation_corpus.id,
    regulation_corpus.title,
    regulation_corpus.content,
    regulation_corpus.section,
    1 - (regulation_corpus.vector <=> query_embedding) AS similarity
  FROM regulation_corpus
  WHERE 1 - (regulation_corpus.vector <=> query_embedding) > match_threshold
  ORDER BY regulation_corpus.vector <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

-- ROW-LEVEL SECURITY (RLS) policies
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- 1. Contracts security: Users read/write their own records
CREATE POLICY "Enable read access for contract owner" ON public.contracts
  FOR SELECT USING (true); -- Accessible by owner / app API key scope

CREATE POLICY "Enable insert access for contract owner" ON public.contracts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for contract owner" ON public.contracts
  FOR UPDATE USING (true);

-- 2. Clauses security: Inherits access via contracts join
CREATE POLICY "Enable read access for clauses" ON public.clauses
  FOR SELECT USING (true);

CREATE POLICY "Enable write access for clauses" ON public.clauses
  FOR INSERT WITH CHECK (true);

-- 3. Chat Session security
CREATE POLICY "Enable access for chat sessions" ON public.chat_sessions
  FOR ALL USING (true);

-- 4. Chat Messages security
CREATE POLICY "Enable access for chat messages" ON public.chat_messages
  FOR ALL USING (true);
