-- Disposable PostgreSQL ONLY, after core migrations and synthetic auth bootstrap.
\set ON_ERROR_STOP on
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000001','a@example.invalid','{}'),
 ('00000000-0000-0000-0000-000000000002','b@example.invalid','{}');
INSERT INTO public.contracts(id,user_id,name,file_path,status) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Synthetic A','a.txt','processing'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Synthetic B','b.txt','processing'),
 ('10000000-0000-0000-0000-000000000003',NULL,'Orphan','orphan.txt','processing');
INSERT INTO public.clauses(contract_id,number,title,text,risk_level,risk_explanation,suggested_redline,risk_score)
 VALUES('10000000-0000-0000-0000-000000000001','old','Old partial','Synthetic old text','low','Synthetic old explanation','',0);
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;
-- Permission assertions also cover SECURITY DEFINER RPC scope.
DO $$ BEGIN
 IF has_function_privilege('anon','public.commit_contract_analysis(text,jsonb,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.commit_contract_analysis(text,jsonb,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.commit_contract_analysis(text,jsonb,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'RPC permissions incorrect'; END IF;
END $$;
-- Force a late failure after replacement inserts but before status commit.
CREATE FUNCTION public.synthetic_fail_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic late update failure'; END $$;
CREATE TRIGGER synthetic_fail_completion BEFORE UPDATE ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.synthetic_fail_completion();
DO $$ BEGIN
 BEGIN
  PERFORM public.commit_contract_analysis('10000000-0000-0000-0000-000000000001',
  '[{"number":"1","title":"New","text":"Synthetic new","risk_level":"high","risk_explanation":"Synthetic explanation","suggested_redline":"","risk_score":60}]',60);
  RAISE EXCEPTION 'expected forced rollback';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'synthetic late update failure' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.clauses WHERE number='old')<>1 OR
    (SELECT count(*) FROM public.clauses WHERE title='New')<>0 OR
    (SELECT status FROM public.contracts WHERE name='Synthetic A')<>'processing'
 THEN RAISE EXCEPTION 'transaction did not roll back all output'; END IF;
END $$;
DROP TRIGGER synthetic_fail_completion ON public.contracts;
DROP FUNCTION public.synthetic_fail_completion();
SET ROLE service_role;
SELECT public.commit_contract_analysis('10000000-0000-0000-0000-000000000001',
 '[{"number":"1","title":"New","text":"Synthetic new","risk_level":"high","risk_explanation":"Synthetic explanation","suggested_redline":"","risk_score":60}]',60);
-- Re-delivery with another valid result must not replace the committed output.
SELECT public.commit_contract_analysis('10000000-0000-0000-0000-000000000001',
 '[{"number":"2","title":"Duplicate","text":"Synthetic duplicate","risk_level":"low","risk_explanation":"Synthetic explanation","suggested_redline":"","risk_score":0}]',0);
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.clauses WHERE contract_id='10000000-0000-0000-0000-000000000001')<>1 OR
    (SELECT overall_risk_score FROM public.contracts WHERE name='Synthetic A')<>60 OR
    (SELECT title FROM public.clauses WHERE contract_id='10000000-0000-0000-0000-000000000001')<>'New'
 THEN RAISE EXCEPTION 'completion or idempotency failed'; END IF;
 BEGIN
  PERFORM public.commit_contract_analysis('10000000-0000-0000-0000-000000000002','[{"title":"Bad","text":"Synthetic","risk_level":"low","risk_explanation":"","suggested_redline":"","risk_score":0}]',0);
  RAISE EXCEPTION 'invalid output accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Invalid clause output' THEN RAISE; END IF; END;
 IF (SELECT status FROM public.contracts WHERE name='Synthetic B')<>'processing' THEN RAISE EXCEPTION 'invalid result changed status'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles)<>1 OR (SELECT count(*) FROM public.contracts)<>1 OR (SELECT count(*) FROM public.clauses)<>1 THEN RAISE EXCEPTION 'A isolation failed'; END IF;
 BEGIN
 INSERT INTO public.contracts(id,user_id,name,file_path,status) VALUES('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Direct write','x','processing');
 RAISE EXCEPTION 'direct write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles)<>1 OR (SELECT count(*) FROM public.contracts)<>1 OR (SELECT count(*) FROM public.clauses)<>0 THEN RAISE EXCEPTION 'B isolation failed'; END IF;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles)<>0 OR (SELECT count(*) FROM public.contracts)<>0 OR (SELECT count(*) FROM public.clauses)<>0 THEN RAISE EXCEPTION 'anon isolation failed'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: rollback, completion, idempotency, validation, RPC privileges, A/B/anon RLS and direct write denial' AS result;
