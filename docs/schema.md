# Database Schema
Reference docs for profiles, contracts, and clauses tables.

## Clause review decisions

`clause_review_decisions` stores the owner's current decision for a clause.
The compound relationship validates that the clause belongs to the contract.
Removing a contract or clause also removes its decisions. A revision or
escalation requires a note of up to 1,000 characters. Reopening removes the
decision and its note. The authenticated server route checks contract ownership
and clause membership before writing. The table grants access to the service
role only.
