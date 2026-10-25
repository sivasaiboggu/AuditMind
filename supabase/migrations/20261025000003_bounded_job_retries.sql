-- Source only. Reviewed rollout required before the matching API.
BEGIN;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS processing_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS processing_error text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
ALTER TABLE public.contract_jobs ADD COLUMN IF NOT EXISTS last_error_code text;
ALTER TABLE public.contract_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.claim_contract_job() RETURNS SETOF public.contract_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.contract_jobs%ROWTYPE;
BEGIN
 -- Terminalize expired final attempts. Lock job first, consistently with commit
 -- and failure RPCs. Skip another worker's in-flight transaction.
 FOR target IN SELECT j.* FROM public.contract_jobs j
  WHERE j.state='running' AND j.lease_until<now() AND j.attempts>=3
  FOR UPDATE SKIP LOCKED
 LOOP
  UPDATE public.contract_jobs SET state='failed',lease_until=NULL,
   last_error_code='RETRY_LIMIT_REACHED',updated_at=now() WHERE contract_id=target.contract_id;
  UPDATE public.contracts SET status='failed',processing_error='RETRY_LIMIT_REACHED',next_retry_at=NULL,updated_at=now()
   WHERE id::text=target.contract_id AND status='processing';
 END LOOP;
 SELECT j.* INTO target FROM public.contract_jobs j
  JOIN public.contracts c ON c.id::text=j.contract_id
  WHERE c.status='processing' AND j.attempts<3 AND j.next_attempt_at<=now()
   AND (j.state='pending' OR (j.state='running' AND j.lease_until<now()))
  ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.contract_jobs SET state='running',lease_token=gen_random_uuid(),
  lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now()
  WHERE contract_id=target.contract_id RETURNING * INTO target;
 UPDATE public.contracts SET processing_attempts=target.attempts,next_retry_at=NULL,updated_at=now()
  WHERE id::text=target.contract_id;
 RETURN NEXT target;
END $$;
CREATE OR REPLACE FUNCTION public.retry_contract_job(p_contract_id text,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.contract_jobs%ROWTYPE;retry_at timestamptz;
BEGIN
 SELECT * INTO target FROM public.contract_jobs WHERE contract_id=p_contract_id
  AND state='running' AND lease_token=p_lease_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF target.attempts>=3 THEN
  UPDATE public.contract_jobs SET state='failed',lease_until=NULL,last_error_code='RETRY_LIMIT_REACHED',updated_at=now() WHERE contract_id=p_contract_id;
  UPDATE public.contracts SET status='failed',processing_error='RETRY_LIMIT_REACHED',next_retry_at=NULL,updated_at=now() WHERE id::text=p_contract_id AND status='processing';
 ELSE
  retry_at:=now()+make_interval(secs=>30*target.attempts);
  UPDATE public.contract_jobs SET state='pending',lease_until=NULL,last_error_code='STORAGE_RETRY_PENDING',next_attempt_at=retry_at,updated_at=now() WHERE contract_id=p_contract_id;
  UPDATE public.contracts SET processing_error='STORAGE_RETRY_PENDING',next_retry_at=retry_at,updated_at=now() WHERE id::text=p_contract_id AND status='processing';
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.fail_contract_job(p_contract_id text,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.contract_jobs WHERE contract_id=p_contract_id AND state='running'
  AND lease_token=p_lease_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE public.contracts SET status='failed',processing_error='ANALYSIS_INCOMPLETE',next_retry_at=NULL,updated_at=now() WHERE id::text=p_contract_id AND status='processing';
 UPDATE public.contract_jobs SET state='failed',lease_until=NULL,last_error_code='ANALYSIS_INCOMPLETE',updated_at=now() WHERE contract_id=p_contract_id;
 RETURN true;
END $$;
-- Clear transient notices when the same contract commits successfully.
CREATE OR REPLACE FUNCTION public.clear_completed_job_notice() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN IF NEW.status='completed' THEN NEW.processing_error:=NULL;NEW.next_retry_at:=NULL;END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS auditmind_clear_job_notice ON public.contracts;
CREATE TRIGGER auditmind_clear_job_notice BEFORE UPDATE ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.clear_completed_job_notice();
REVOKE ALL ON FUNCTION public.retry_contract_job(text,uuid),public.clear_completed_job_notice() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_contract_job(text,uuid) TO service_role;
COMMIT;
