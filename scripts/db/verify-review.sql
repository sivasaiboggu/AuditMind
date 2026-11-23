BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('72000000-0000-0000-0000-000000000001', 'review-a@example.invalid'),
       ('72000000-0000-0000-0000-000000000002', 'review-b@example.invalid');

INSERT INTO public.contracts (id, user_id, name, file_path, status, mime_type)
VALUES ('70000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
        'Synthetic review A', 'review-a.txt', 'completed', 'text/plain'),
       ('70000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002',
        'Synthetic review B', 'review-b.txt', 'completed', 'text/plain');

INSERT INTO public.clauses (id, contract_id, number, title, text)
VALUES ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
        '1', 'Liability', 'Synthetic A'),
       ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002',
        '1', 'Renewal', 'Synthetic B');

SET ROLE service_role;
INSERT INTO public.clause_review_decisions (clause_id, contract_id, outcome, note)
VALUES ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
        'revise', 'Ask for a fixed cap.');

INSERT INTO public.clause_review_decisions (clause_id, contract_id, outcome, note)
VALUES ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001',
        'accepted', '')
ON CONFLICT (clause_id) DO UPDATE SET outcome = excluded.outcome, note = excluded.note;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.clause_review_decisions) <> 1 OR
     (SELECT outcome FROM public.clause_review_decisions) IS DISTINCT FROM 'accepted'
  THEN RAISE EXCEPTION 'decision update did not replace the saved decision'; END IF;

  BEGIN
    INSERT INTO public.clause_review_decisions (clause_id, contract_id, outcome)
    VALUES ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'accepted');
    RAISE EXCEPTION 'a clause could be saved under another contract';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.clause_review_decisions (clause_id, contract_id, outcome, note)
    VALUES ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'escalate', '   ');
    RAISE EXCEPTION 'a follow-up decision could be saved without a note';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

RESET ROLE;
SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM note FROM public.clause_review_decisions;
    RAISE EXCEPTION 'direct client access to review notes was granted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
DELETE FROM public.contracts WHERE id = '70000000-0000-0000-0000-000000000001';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clause_review_decisions)
  THEN RAISE EXCEPTION 'contract deletion left a review decision behind'; END IF;
END $$;

SELECT 'PASS: private review decisions validate, update in place and cascade on deletion' AS result;
ROLLBACK;
