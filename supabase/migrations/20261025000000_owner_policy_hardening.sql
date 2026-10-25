-- SOURCE ONLY: requires reviewed rollout and two-user Supabase verification.
-- Policy repair does not copy, delete or reassign user data. Orphaned records
-- remain inaccessible. Service-role API access is unchanged. Unknown policies
-- are preserved and must be audited separately because permissive policies OR.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.clauses ADD COLUMN IF NOT EXISTS risk_score integer
  DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow owner read access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "auditmind_owner_read_profiles" ON public.profiles;
CREATE POLICY "auditmind_owner_read_profiles" ON public.profiles
  FOR SELECT TO authenticated USING (id::text = auth.uid()::text);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can insert own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Enable read access for contract owner" ON public.contracts;
DROP POLICY IF EXISTS "Enable insert access for contract owner" ON public.contracts;
DROP POLICY IF EXISTS "Enable update access for contract owner" ON public.contracts;
DROP POLICY IF EXISTS "auditmind_owner_read_contracts" ON public.contracts;
CREATE POLICY "auditmind_owner_read_contracts" ON public.contracts
  FOR SELECT TO authenticated USING (user_id::text = auth.uid()::text);

ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view clauses of own contracts" ON public.clauses;
DROP POLICY IF EXISTS "Enable read access for clauses" ON public.clauses;
DROP POLICY IF EXISTS "Enable write access for clauses" ON public.clauses;
DROP POLICY IF EXISTS "auditmind_owner_read_clauses" ON public.clauses;
CREATE POLICY "auditmind_owner_read_clauses" ON public.clauses
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = clauses.contract_id AND c.user_id::text = auth.uid()::text));

ALTER TABLE public.risk_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view reports of own contracts" ON public.risk_reports;
DROP POLICY IF EXISTS "auditmind_owner_read_risk_reports" ON public.risk_reports;
CREATE POLICY "auditmind_owner_read_risk_reports" ON public.risk_reports
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = risk_reports.contract_id AND c.user_id::text = auth.uid()::text));

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Enable access for chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "auditmind_owner_read_chat_sessions" ON public.chat_sessions;
CREATE POLICY "auditmind_owner_read_chat_sessions" ON public.chat_sessions
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.contracts c WHERE c.id = chat_sessions.contract_id AND c.user_id::text = auth.uid()::text));

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view messages of own sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Enable access for chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "auditmind_owner_read_chat_messages" ON public.chat_messages;
CREATE POLICY "auditmind_owner_read_chat_messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.chat_sessions s JOIN public.contracts c ON c.id = s.contract_id WHERE s.id = chat_messages.session_id AND c.user_id::text = auth.uid()::text));

DROP POLICY IF EXISTS "auditmind_owner_update_profile" ON public.profiles;
CREATE POLICY "auditmind_owner_update_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id::text = auth.uid()::text) WITH CHECK (id::text = auth.uid()::text);
COMMIT;
