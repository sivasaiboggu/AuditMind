\set ON_ERROR_STOP on
-- Remove restart fixture left by the preceding test, then isolate retry cases.
DELETE FROM public.contracts WHERE name='Restart fixture';
INSERT INTO public.contracts(id,user_id,name,file_path,status,mime_type) VALUES
 ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Retry fixture','retry.txt','processing','text/plain');
DO $$ DECLARE j public.contract_jobs%ROWTYPE;i integer;BEGIN
 FOR i IN 1..3 LOOP
  SELECT * INTO j FROM public.claim_contract_job();
  IF j.attempts<>i THEN RAISE EXCEPTION 'attempt count wrong';END IF;
  IF NOT public.retry_contract_job(j.contract_id,j.lease_token) THEN RAISE EXCEPTION 'retry failed';END IF;
  IF EXISTS(SELECT 1 FROM public.claim_contract_job()) THEN RAISE EXCEPTION 'backoff or cap bypassed';END IF;
  IF i<3 THEN
   IF (SELECT processing_error FROM public.contracts WHERE id::text=j.contract_id)<>'STORAGE_RETRY_PENDING' THEN RAISE EXCEPTION 'retry invisible';END IF;
   UPDATE public.contract_jobs SET next_attempt_at=now()-interval '1 second' WHERE contract_id=j.contract_id;
  END IF;
 END LOOP;
 IF (SELECT state FROM public.contract_jobs WHERE contract_id=j.contract_id)<>'failed' OR
    (SELECT processing_error FROM public.contracts WHERE id::text=j.contract_id)<>'RETRY_LIMIT_REACHED' OR
    (SELECT processing_attempts FROM public.contracts WHERE id::text=j.contract_id)<>3
 THEN RAISE EXCEPTION 'retry exhaustion invisible';END IF;
END $$;
DELETE FROM public.contracts WHERE name='Retry fixture';
INSERT INTO public.contracts(id,user_id,name,file_path,status,mime_type) VALUES
 ('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Crash cap fixture','crash.txt','processing','text/plain');
DO $$ DECLARE j public.contract_jobs%ROWTYPE;i integer;BEGIN
 FOR i IN 1..3 LOOP
  SELECT * INTO j FROM public.claim_contract_job();
  IF j.attempts<>i THEN RAISE EXCEPTION 'crash attempt wrong';END IF;
  UPDATE public.contract_jobs SET lease_until=now()-interval '1 second' WHERE contract_id=j.contract_id;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.claim_contract_job()) THEN RAISE EXCEPTION 'crash loop exceeded cap';END IF;
 IF (SELECT status FROM public.contracts WHERE id::text=j.contract_id)<>'failed' THEN RAISE EXCEPTION 'crash cap did not terminalize';END IF;
END $$;
SELECT 'PASS: bounded retries/backoff, owner-visible attempt/error metadata, expired final-attempt terminalization' AS result;
