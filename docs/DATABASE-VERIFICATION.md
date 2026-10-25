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

These are acceptance checks, not claims that they have run. Current automated
route tests use a synthetic store. The workspace has no configured isolated
Supabase project or database server, so SQL has passed PostgreSQL grammar parsing but has not been executed or semantically verified against a real schema.
Live rollout remains on hold along with deployment.
