-- Compatibility additions for the original UUID schema. Do not redeclare a
-- conflicting text-ID schema, change the RPC return type, or add USING(true)
-- policies. Existing installs also need the following owner-policy migration.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.clauses ADD COLUMN IF NOT EXISTS risk_score integer
  DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS contracts_user_idx ON public.contracts (user_id);
CREATE INDEX IF NOT EXISTS clauses_contract_idx ON public.clauses (contract_id);
CREATE INDEX IF NOT EXISTS chat_sessions_contract_idx ON public.chat_sessions (contract_id);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON public.chat_messages (session_id);
