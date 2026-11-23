BEGIN;

ALTER TABLE public.clauses ADD CONSTRAINT clauses_contract_id_id_key UNIQUE (contract_id, id);

CREATE TABLE public.clause_review_decisions (
  clause_id uuid PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'revise', 'escalate')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (contract_id, clause_id) REFERENCES public.clauses(contract_id, id) ON DELETE CASCADE,
  CHECK (outcome = 'accepted' OR note ~ '[^[:space:]]')
);

CREATE INDEX clause_review_decisions_contract_idx ON public.clause_review_decisions(contract_id);
ALTER TABLE public.clause_review_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clause_review_decisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clause_review_decisions TO service_role;

COMMIT;
