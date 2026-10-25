# Database verification and rollout gate

The source migrations previously disagreed about UUID/text IDs, corpus vector
columns, chat columns and the return type of `match_regulations`. Broad later
policies also made owner policies ineffective because permissive policies combine
with OR. The fresh-project source now keeps the original UUID schema, adds the
missing avatar column before the profile trigger is installed, and uses owner
reads. The new policy-repair migration removes only known legacy policy names.
Unknown policies are deliberately preserved and need review.

## Before using an existing database

Do not apply these files blindly. No existing project has been inspected here.
Back up the schema and data, list applied migrations and inspect `pg_policies`
for every private table. Confirm actual ID types, foreign keys, profile fields,
clause risk score and the existing vector/RPC shape. The repair migration handles
owner comparisons for UUID or text user IDs but does not convert tables, move
orphaned records, or rewrite corpus vectors. If the database lacks a table from
the baseline, reconcile it before attempting this repair. Corpus contents,
applicability, freshness and embeddings need their own check.

## Disposable-project acceptance checks

1. Apply all migrations in order to an empty isolated Supabase project, with the
   vector extension available. Verify signup creates a private profile correctly.
2. Create two synthetic users A and B, sign in with actual issued tokens, and
   upload synthetic documents through the API. Never use production documents.
3. From A's browser/anon client, read A's profile and completed contract/clauses.
   Verify B's rows, null-owner rows and unowned chat messages are not returned.
   Repeat as B, signed out, after token expiry and after A-to-B-to-A switches.
4. Verify direct client contract/clause/chat writes are denied. Writes go through
   the authenticated API with a server-only service-role key, never a VITE key.
5. Inspect **all** remaining policies. An unknown permissive policy can still
   override the intended isolation. Restrictive custom policies may also affect
   expected access and should not be discarded to make a test pass.
6. Check the `contracts` Storage bucket is private. Confirm unowned object
   listing/download/update/delete fails with anon and A/B credentials. Table RLS
   does not protect a public bucket. No bucket policy is changed by this patch.
7. Test reconnect, interrupted upload, worker failure between clause insert and
   status update, API restart, and queue-worker crash. Do not call recovery durable
   until those checks pass. Current Redis RPOP and in-memory queue modes still
   have loss windows; an outbox/lease design is separate unfinished work.

These Supabase acceptance checks have not run. API route tests still use a
synthetic store. Core SQL was separately executed on disposable local PostgreSQL
as described below. Live rollout remains on hold along with deployment.

## Atomic analysis commit rollout

`20261025000001_atomic_analysis_commit.sql` must be applied and tested before the
API worker version that calls it. The function locks the contract, replaces clause
rows and commits completed status in one transaction. An already completed contract
is a no-op on re-delivery. Only the service role can execute it. Verify rollback on
bad clause output, concurrent calls, a lost HTTP response after commit, and a worker
restart. The TypeScript regression suite substitutes this RPC. The separate disposable
PostgreSQL harness checks core semantics and permissions but not Supabase services. Without this migration, analysis fails closed.
Queue delivery still has separate crash/loss windows and is not durable yet.


## Executed local PostgreSQL verification

On October 25, the core migrations and atomic commit were executed on a disposable
PostgreSQL 14.24 cluster listening on loopback only. No user or production database
was connected. `scripts/db/run-isolated.sh` creates a new cluster, loads synthetic
roles/users and core migrations, runs assertions, then stops and deletes the cluster.
It refuses external database URLs and takes only local binary/share directories.

Passed assertions:
- A forced late UPDATE failure rolls back both deleted old clauses and inserted
  replacement clauses, leaving the processing status unchanged.
- A valid service-role commit persists the actual score and clause rows together.
- Re-delivery does not replace or duplicate completed results.
- Invalid explanations leave the contract processing and persist no output.
- Two concurrent sessions serialize on the contract row and leave one result set.
- Anonymous and authenticated roles cannot execute the RPC; the service role can.
- Actual PostgreSQL RLS returns only A's or B's profile/contracts/clauses, hides
  null-owner and anonymous records, and denies direct client contract insertion.
- The signup trigger creates a profile with the added avatar column present.

Limits: `auth.uid()` is a synthetic session-setting function, not real Supabase
JWT issuance. The vector extension, corpus table and matching RPC are excluded
from this core harness. Storage, Redis, real Auth, browser token refresh/expiry,
custom deployed policies, network-loss/restart recovery and legal/provider quality
are not verified by it. These local passes do not authorize or prove a live rollout.

Run with a local PostgreSQL server installation and Python `pglast` available:

```sh
PG_BIN=/absolute/path/to/postgresql/bin \
PG_SHARE=/absolute/path/to/postgresql/share \
  scripts/db/run-isolated.sh
```

`psql` must be on PATH. The default loopback test port is 55439; set
`PG_TEST_PORT` to another unused port if needed. Never point this harness at an
existing cluster. It uses only synthetic `example.invalid` identities and fixtures.


## Durable-job rollout and recovery checks

`20261025000002_durable_contract_jobs.sql` adds the authoritative job ledger,
contract MIME field, insert/delete triggers and service-only lease RPCs. The worker
no longer delivers via Redis or memory. The ledger and metadata are transactional;
Storage upload still precedes metadata and can leave a retained object when
acceptance is ambiguous. Inventory those objects rather than delete or retry them
without checking the actual owned record. Existing Redis jobs and processing
contracts with missing MIME/job metadata require a separate operator-approved
reconciliation. This migration does not guess MIME types or replay old payloads.

Local tests passed trigger rollback on invalid MIME, one active lease per job,
lease renewal and expiry, changed tokens on re-delivery, stale completion/failure
denial, atomic result/job completion, completed acknowledgement, private job cleanup,
and immediate PostgreSQL shutdown/restart preserving the ledger. Lease expiry was
advanced explicitly for the restart test rather than waiting two minutes. This is
real local database execution, not real Supabase Storage/Auth/network recovery.

Before rollout, test actual private-object download, auth/session expiry, sustained
heartbeat delays, service restart and response loss. Monitor old processing jobs,
repeated file-download failures, exhausted external quotas and retained upload
objects. There is no automatic dead-letter dashboard or retry cap yet. Lease
fencing prevents stale result writes but does not prevent repeated provider work
or prove legal accuracy. Free-tier limits depend on traffic and polling, not the
presence of a queue design. Deployment and all live migration/config work remain
held until explicitly authorized.
