#!/usr/bin/env bash
# Creates and destroys a local disposable cluster. Never accepts a database URL.
set -euo pipefail
: "${PG_BIN:?Set PG_BIN to a directory containing initdb, postgres and pg_ctl}"
: "${PG_SHARE:?Set PG_SHARE to the matching PostgreSQL share directory}"
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d /tmp/auditmind-db-test.XXXXXX)
PORT=${PG_TEST_PORT:-55439}
cleanup() { "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$WORK/data" -L "$PG_SHARE" --auth=trust --no-locale >"$WORK/init.log"
"$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -o "-h 127.0.0.1 -p $PORT -k $WORK" start
PSQL=(psql -X -h 127.0.0.1 -p "$PORT" -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" <<'SQL'
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
SQL
# pglast is a test-only Python dependency. Exclude ONLY corpus/vector statements:
# this harness proves core transaction/RLS behavior, not a complete Supabase schema.
python3 - "$ROOT" "$WORK" <<'PY'
from pathlib import Path
from pglast import parse_sql
import sys
root,work=map(Path,sys.argv[1:]);s=(root/'supabase/migrations/20240101000000_init.sql').read_text();out=[]
for st in parse_sql(s):
 text=s[st.stmt_location:st.stmt_location+st.stmt_len] if st.stmt_len else s[st.stmt_location:]
 if 'vector' in text.lower() or 'regulation_corpus' in text:continue
 out.append(text+';')
(work/'core.sql').write_text('\n'.join(out))
PY
"${PSQL[@]}" -f "$WORK/core.sql"
for migration in 20240101000001_profiles.sql 20260630000000_init_schema.sql 20261025000000_owner_policy_hardening.sql 20261025000001_atomic_analysis_commit.sql 20261025000002_durable_contract_jobs.sql; do
 "${PSQL[@]}" -f "$ROOT/supabase/migrations/$migration"
done
"${PSQL[@]}" -f "$ROOT/scripts/db/verify-atomic.sql"
# Hold the row lock during one commit and race a second session against it.
"${PSQL[@]}" <<'SQL'
CREATE FUNCTION public.synthetic_delay_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$;
CREATE TRIGGER synthetic_delay_completion BEFORE UPDATE ON public.contracts
 FOR EACH ROW EXECUTE FUNCTION public.synthetic_delay_completion();
SQL
cat > "$WORK/commit.sql" <<'SQL'
SET ROLE service_role;
SELECT public.commit_contract_analysis('10000000-0000-0000-0000-000000000002',
 '[{"number":"1","title":"Concurrent","text":"Synthetic","risk_level":"medium","risk_explanation":"Synthetic explanation","suggested_redline":"","risk_score":40}]',40);
SQL
"${PSQL[@]}" -f "$WORK/commit.sql" >"$WORK/a.log" 2>&1 &
A=$!
"${PSQL[@]}" -f "$WORK/commit.sql" >"$WORK/b.log" 2>&1 &
B=$!
wait "$A"; wait "$B"
"${PSQL[@]}" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM public.clauses WHERE contract_id='10000000-0000-0000-0000-000000000002')<>1 OR
    (SELECT status FROM public.contracts WHERE name='Synthetic B')<>'completed'
 THEN RAISE EXCEPTION 'concurrent idempotency failed'; END IF;
END $$;
SELECT 'PASS: concurrent commits serialize and leave one result set' AS result;
SQL
"${PSQL[@]}" -f "$ROOT/scripts/db/verify-jobs.sql"
# A process restart must not lose an accepted job. Expire its persisted lease
# explicitly so this test need not sleep for the full two-minute production lease.
"${PSQL[@]}" <<'SQL'
INSERT INTO public.contracts(id,user_id,name,file_path,status,mime_type) VALUES
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Restart fixture','restart.txt','processing','text/plain');
SELECT contract_id,state,attempts FROM public.claim_contract_job();
SQL
"$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop
"$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -o "-h 127.0.0.1 -p $PORT -k $WORK" start
"${PSQL[@]}" <<'SQL'
DO $$ BEGIN
 IF (SELECT state FROM public.contract_jobs WHERE contract_id='30000000-0000-0000-0000-000000000001')<>'running' THEN RAISE EXCEPTION 'restart lost running job';END IF;
END $$;
UPDATE public.contract_jobs SET lease_until=now()-interval '1 second' WHERE contract_id='30000000-0000-0000-0000-000000000001';
DO $$ DECLARE j public.contract_jobs%ROWTYPE;BEGIN
 SELECT * INTO j FROM public.claim_contract_job();
 IF j.contract_id<>'30000000-0000-0000-0000-000000000001' OR j.attempts<>2 THEN RAISE EXCEPTION 'restart recovery failed';END IF;
END $$;
SELECT 'PASS: immediate database restart preserves accepted job and expired lease is reclaimed' AS result;
SQL
