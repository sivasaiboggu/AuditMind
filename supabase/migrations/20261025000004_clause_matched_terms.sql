-- Source only. Review and test in a disposable project before API rollout.
-- Adds the evidence behind each clause's risk tier: the exact words the
-- review rules fired on, stored with the clause so the review UI can show
-- them without re-running the rules. No live data is backfilled — clauses
-- analysed before this migration keep the empty default, and the UI omits
-- the evidence line rather than inventing one.
BEGIN;
ALTER TABLE public.clauses ADD COLUMN IF NOT EXISTS matched_terms text[] NOT NULL DEFAULT '{}';

-- Same signature as before, so existing grants still apply. A clause row
-- without matched_terms stores the empty default; a non-array value fails
-- the run, like any other invalid clause output.
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
           suggested_redline text, risk_score integer, matched_terms text[])
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
     suggested_redline, risk_score, matched_terms)
  SELECT target.id, x.number, x.title, x.text, x.risk_level,
         x.risk_explanation, x.suggested_redline, x.risk_score,
         COALESCE(x.matched_terms, '{}')
  FROM jsonb_to_recordset(p_clauses)
    AS x(number text, title text, text text, risk_level text,
         risk_explanation text, suggested_redline text, risk_score integer,
         matched_terms text[]);
  UPDATE public.contracts SET status = 'completed',
    overall_risk_score = p_overall_score, updated_at = now()
    WHERE id = target.id;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_contract_analysis(text,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_contract_analysis(text,jsonb,integer) TO service_role;
COMMIT;
