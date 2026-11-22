import type { Clause, Contract, ReviewOutcome } from '@auditmind/shared-types';

export const reviewLabels: Record<ReviewOutcome, string> = {
  accepted: 'Accept as written',
  revise: 'Request revision',
  escalate: 'Escalate',
};

export function findReviewClause(clauses: Clause[], id: string | null) {
  return clauses.find((clause) => clause.id === id) ?? clauses[0];
}

export function nextUndecided(clauses: Clause[], currentId: string | undefined) {
  const start = clauses.findIndex((clause) => clause.id === currentId) + 1;
  return clauses.slice(start).find((clause) => !clause.review)
    ?? clauses.slice(0, start).find((clause) => !clause.review && clause.id !== currentId);
}

export function reviewQueueState(contract: Contract) {
  if (contract.status !== 'completed') return 'analysis';
  const { total = 0, decided = 0 } = contract.reviewProgress ?? {};
  return total > 0 && decided >= total ? 'reviewed' : 'to-review';
}

export async function readClausePages(fetchPage: (offset: number, limit: number) => Promise<Clause[]>) {
  const clauses: Clause[] = [];
  // The parser can produce up to 500 clauses. Existing API callers retain a 50-row default.
  const pageSize = 100;
  for (let offset = 0; offset < 500; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    clauses.push(...page);
    if (page.length < pageSize) break;
  }
  return clauses;
}
