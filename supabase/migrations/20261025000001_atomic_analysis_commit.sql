-- Source only. Review and test in a disposable project before API rollout.
BEGIN;
CREATE OR REPLACE FUNCTION public.commit_contract_analysis(
  p_contract_id text, p_clauses jsonb, p_overall_score integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  target public.contracts%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.contracts
    WHERE id::text = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract not found'; END IF;
  -- Re-delivery after a successful commit must not duplicate or replace results.
  IF target.status = 'completed' THEN RETURN; END IF;
  IF target.status <> 'processing' THEN RAISE EXCEPTION 'Contract is not processing'; END IF;
  IF p_overall_score IS NULL OR p_overall_score < 0 OR p_overall_score > 100
     OR jsonb_typeof(p_clauses) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_clauses) = 0 THEN
    RAISE EXCEPTION 'Invalid analysis output';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_clauses)
      AS x(title text, text text, risk_level text, risk_explanation text,
           suggested_redline text, risk_score integer)
    WHERE x.title IS NULL OR btrim(x.title) = '' OR x.text IS NULL OR btrim(x.text) = ''
      OR x.risk_level IS NULL OR x.risk_level NOT IN ('low','medium','high','critical')
      OR x.risk_explanation IS NULL OR btrim(x.risk_explanation) = ''
      OR x.suggested_redline IS NULL OR x.risk_score IS NULL
      OR x.risk_score < 0 OR x.risk_score > 100
  ) THEN RAISE EXCEPTION 'Invalid clause output'; END IF;

  -- Both statements and the status update run in this one transaction. Any
  -- exception rolls back the old rows and all new rows together.
  DELETE FROM public.clauses WHERE contract_id = target.id;
  INSERT INTO public.clauses
    (contract_id, number, title, text, risk_level, risk_explanation,
     suggested_redline, risk_score)
  SELECT target.id, x.number, x.title, x.text, x.risk_level,
         x.risk_explanation, x.suggested_redline, x.risk_score
  FROM jsonb_to_recordset(p_clauses)
    AS x(number text, title text, text text, risk_level text,
         risk_explanation text, suggested_redline text, risk_score integer);
  UPDATE public.contracts SET status = 'completed',
    overall_risk_score = p_overall_score, updated_at = now()
    WHERE id = target.id;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_contract_analysis(text,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_contract_analysis(text,jsonb,integer) TO service_role;
COMMIT;
