import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Clause, Contract } from '@auditmind/shared-types';
import { nextUndecided, readClausePages, reviewQueueState } from './review';

function clause(id: string, reviewed = false): Clause {
  return {
    id, contractId: 'contract', number: id, title: 'Test clause', text: 'Text',
    riskLevel: 'low', riskExplanation: 'Explanation',
    ...(reviewed && { review: { outcome: 'accepted', note: '', updatedAt: '2026-11-22' } }),
  };
}

test('loads up to the parser limit without dropping a clause after the first page', async () => {
  const all = Array.from({ length: 500 }, (_, index) => clause(String(index)));
  const offsets: number[] = [];
  const result = await readClausePages(async (offset, limit) => {
    offsets.push(offset);
    return all.slice(offset, offset + limit);
  });
  assert.deepEqual(offsets, [0, 100, 200, 300, 400]);
  assert.deepEqual(result, all);
});

test('stops at a partial page and rejects when any page cannot be loaded', async () => {
  const page = [clause('1')];
  let loads = 0;
  assert.deepEqual(await readClausePages(async () => { loads++; return page; }), page);
  assert.equal(loads, 1);
  await assert.rejects(readClausePages(async (offset) => {
    if (offset) throw new Error('Unavailable');
    return Array.from({ length: 100 }, (_, index) => clause(String(index)));
  }), /Unavailable/);
});

test('next undecided skips saved decisions, wraps, and avoids selecting the current clause', () => {
  const clauses = [clause('1'), clause('2', true), clause('3'), clause('4', true)];
  assert.equal(nextUndecided(clauses, '1')?.id, '3');
  assert.equal(nextUndecided(clauses, '3')?.id, '1');
  assert.equal(nextUndecided([clause('1'), clause('2', true)], '1'), undefined);
});

test('queue state distinguishes analysis status from review progress, including older records', () => {
  const contract: Contract = {
    id: 'contract', filePath: 'fixture.txt', name: 'Fixture', userId: 'owner',
    status: 'completed', overallRiskScore: 0, createdAt: '', updatedAt: '',
  };
  assert.equal(reviewQueueState(contract), 'to-review');
  assert.equal(reviewQueueState({ ...contract, reviewProgress: { total: 3, decided: 2 } }), 'to-review');
  assert.equal(reviewQueueState({ ...contract, reviewProgress: { total: 3, decided: 3 } }), 'reviewed');
  assert.equal(reviewQueueState({ ...contract, reviewProgress: { total: 0, decided: 0 } }), 'to-review');
  assert.equal(reviewQueueState({ ...contract, status: 'failed' }), 'analysis');
});
