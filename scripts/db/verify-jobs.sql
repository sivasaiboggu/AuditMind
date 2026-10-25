\set ON_ERROR_STOP on
DROP TRIGGER synthetic_delay_completion ON public.contracts;
DROP FUNCTION public.synthetic_delay_completion();
INSERT INTO public.contracts(id,user_id,name,file_path,status,mime_type) VALUES
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Durable A','durable.txt','processing','text/plain');
DO $$ DECLARE old_token uuid;new_token uuid;j public.contract_jobs%ROWTYPE;BEGIN
 IF (SELECT count(*) FROM public.contract_jobs)<>1 THEN RAISE EXCEPTION 'outbox was not atomic with metadata';END IF;
 SELECT * INTO j FROM public.claim_contract_job();old_token:=j.lease_token;
 IF j.state<>'running' OR j.attempts<>1 THEN RAISE EXCEPTION 'claim failed';END IF;
 IF EXISTS(SELECT 1 FROM public.claim_contract_job()) THEN RAISE EXCEPTION 'active lease delivered twice';END IF;
 IF public.renew_contract_job(j.contract_id,gen_random_uuid()) THEN RAISE EXCEPTION 'wrong token renewed';END IF;
 IF NOT public.renew_contract_job(j.contract_id,old_token) THEN RAISE EXCEPTION 'current renewal failed';END IF;
 UPDATE public.contract_jobs SET lease_until=now()-interval '1 second';
 SELECT * INTO j FROM public.claim_contract_job();new_token:=j.lease_token;
 IF j.attempts<>2 OR new_token=old_token THEN RAISE EXCEPTION 'crash recovery did not fence expired worker';END IF;
 IF public.fail_contract_job(j.contract_id,old_token) THEN RAISE EXCEPTION 'old worker failed new job';END IF;
 BEGIN
 PERFORM public.complete_contract_job(j.contract_id,old_token,
  '[{"number":"1","title":"Old","text":"Synthetic","risk_level":"low","risk_explanation":"Synthetic","suggested_redline":"","risk_score":0}]',0);
 RAISE EXCEPTION 'old worker committed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Job lease is no longer current' THEN RAISE;END IF;END;
 PERFORM public.complete_contract_job(j.contract_id,new_token,
  '[{"number":"1","title":"Recovered","text":"Synthetic","risk_level":"high","risk_explanation":"Synthetic","suggested_redline":"","risk_score":60}]',60);
 PERFORM public.complete_contract_job(j.contract_id,new_token,'[]',0);
 IF (SELECT state FROM public.contract_jobs WHERE contract_id=j.contract_id)<>'completed' OR
    (SELECT status FROM public.contracts WHERE id::text=j.contract_id)<>'completed' OR
    (SELECT count(*) FROM public.clauses WHERE contract_id::text=j.contract_id)<>1
 THEN RAISE EXCEPTION 'job and result did not complete together';END IF;
 IF EXISTS(SELECT 1 FROM public.claim_contract_job()) THEN RAISE EXCEPTION 'completed job redelivered';END IF;
END $$;
-- Trigger failure rolls back metadata too, not an unqueued processing contract.
DO $$ BEGIN
 BEGIN
 INSERT INTO public.contracts(id,user_id,name,file_path,status,mime_type)
 VALUES('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Bad job','bad.txt','processing','invalid');
 RAISE EXCEPTION 'invalid job accepted'; EXCEPTION WHEN check_violation THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.contracts WHERE name='Bad job') THEN RAISE EXCEPTION 'outbox rejection left metadata';END IF;
END $$;
DELETE FROM public.contracts WHERE name='Durable A';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.contract_jobs) THEN RAISE EXCEPTION 'delete leaked private job metadata';END IF;END $$;
SELECT 'PASS: transactional outbox, lease claim/renewal/expiry, stale-worker fencing, atomic job completion and cleanup' AS result;
