-- Source only. Apply after isolated verification and reviewed rollout, before API.
-- Database ledger is authoritative; Redis is not required for delivery.
BEGIN;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS mime_type text;
CREATE TABLE IF NOT EXISTS public.contract_jobs (
  contract_id text PRIMARY KEY,
  file_path text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','failed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_jobs FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS contract_jobs_claim_idx ON public.contract_jobs(state,lease_until,created_at);

-- Transactional outbox: a committed new contract already has a durable job even
-- if the API dies before its explicit enqueue call or loses the insert response.
CREATE OR REPLACE FUNCTION public.schedule_contract_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.status = 'processing' AND NEW.mime_type IS NOT NULL THEN
  INSERT INTO public.contract_jobs(contract_id,file_path,mime_type)
   VALUES(NEW.id::text,NEW.file_path,NEW.mime_type) ON CONFLICT (contract_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS auditmind_schedule_job ON public.contracts;
CREATE TRIGGER auditmind_schedule_job AFTER INSERT ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.schedule_contract_job();

CREATE OR REPLACE FUNCTION public.claim_contract_job() RETURNS SETOF public.contract_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.contract_jobs%ROWTYPE;
BEGIN
 SELECT j.* INTO target FROM public.contract_jobs j
  JOIN public.contracts c ON c.id::text=j.contract_id
  WHERE c.status='processing' AND (j.state='pending' OR (j.state='running' AND j.lease_until<now()))
  ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.contract_jobs SET state='running', lease_token=gen_random_uuid(),
  lease_until=now()+interval '2 minutes', attempts=attempts+1, updated_at=now()
  WHERE contract_id=target.contract_id RETURNING * INTO target;
 RETURN NEXT target;
END $$;
CREATE OR REPLACE FUNCTION public.renew_contract_job(p_contract_id text,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 UPDATE public.contract_jobs SET lease_until=now()+interval '2 minutes',updated_at=now()
 WHERE contract_id=p_contract_id AND state='running' AND lease_token=p_lease_token AND lease_until>now();
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.complete_contract_job(
 p_contract_id text,p_lease_token uuid,p_clauses jsonb,p_overall_score integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target public.contract_jobs%ROWTYPE;
BEGIN
 SELECT * INTO target FROM public.contract_jobs WHERE contract_id=p_contract_id FOR UPDATE;
 -- Successful commit whose HTTP response was lost can safely be acknowledged.
 IF target.state='completed' AND target.lease_token=p_lease_token THEN RETURN; END IF;
 IF NOT FOUND OR target.state<>'running' OR target.lease_token IS DISTINCT FROM p_lease_token
    OR target.lease_until<=now() THEN RAISE EXCEPTION 'Job lease is no longer current'; END IF;
 PERFORM public.commit_contract_analysis(p_contract_id,p_clauses,p_overall_score);
 UPDATE public.contract_jobs SET state='completed',lease_until=NULL,updated_at=now() WHERE contract_id=p_contract_id;
END $$;
CREATE OR REPLACE FUNCTION public.fail_contract_job(p_contract_id text,p_lease_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.contract_jobs WHERE contract_id=p_contract_id AND state='running'
  AND lease_token=p_lease_token AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.contracts SET status='failed',updated_at=now() WHERE id::text=p_contract_id AND status='processing';
 UPDATE public.contract_jobs SET state='failed',lease_until=NULL,updated_at=now() WHERE contract_id=p_contract_id;
 RETURN true;
END $$;
-- Retain private file metadata only for contracts still present. Deletion of
-- processing contracts is separately blocked by the API.
CREATE OR REPLACE FUNCTION public.remove_contract_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN DELETE FROM public.contract_jobs WHERE contract_id=OLD.id::text; RETURN OLD; END $$;
DROP TRIGGER IF EXISTS auditmind_remove_job ON public.contracts;
CREATE TRIGGER auditmind_remove_job AFTER DELETE ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.remove_contract_job();

REVOKE ALL ON FUNCTION public.schedule_contract_job(),public.remove_contract_job(),public.claim_contract_job(),
 public.renew_contract_job(text,uuid),public.complete_contract_job(text,uuid,jsonb,integer),public.fail_contract_job(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_contract_job(),public.renew_contract_job(text,uuid),
 public.complete_contract_job(text,uuid,jsonb,integer),public.fail_contract_job(text,uuid) TO service_role;
COMMIT;
