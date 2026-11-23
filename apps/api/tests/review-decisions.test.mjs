import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../dist/app.js';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const clauseA = '00000000-0000-4000-8000-000000000003';
const clauseB = '00000000-0000-4000-8000-000000000004';
const url = (contract = a, clause = clauseA) => `/contracts/${contract}/review/${clause}`;
const owner = { authorization: 'Bearer owner-a', origin: 'http://localhost:5173' };

async function testApp(status = 'completed') {
  const decisions = new Map();
  const rows = {
    contracts: [
      { id: a, user_id: 'owner-a', status },
      { id: b, user_id: 'owner-b', status: 'completed' },
    ],
    clauses: [
      { id: clauseA, contract_id: a, number: '1' },
      { id: clauseB, contract_id: b, number: '1' },
    ],
  };
  const store = {
    auth: { async getUser(token) { return { data: { user: { id: token } } }; } },
    from(table) {
      const filters = new Map();
      let removal = false;
      let written;
      const matches = (row) => [...filters].every(([key, value]) => row[key] === value);
      return {
        select() { return this; },
        eq(key, value) { filters.set(key, value); return this; },
        order() { return this; },
        range() { return this; },
        async maybeSingle() { return { data: rows[table].find(matches), error: null }; },
        upsert(row) { written = row; decisions.set(row.clause_id, row); return this; },
        single() { return { data: written, error: null }; },
        delete() { removal = true; return this; },
        then(resolve) {
          if (removal) {
            const clause = filters.get('clause_id');
            if (decisions.has(clause) && matches(decisions.get(clause))) decisions.delete(clause);
            resolve({ error: null });
          } else if (table === 'clauses') {
            resolve({ data: rows.clauses.filter(matches).map((row) => ({ ...row, clause_review_decisions: decisions.get(row.id) })) });
          } else {
            const data = rows.contracts.filter(matches).map((row) => ({
              ...row,
              clauses: [{ count: rows.clauses.filter((clause) => clause.contract_id === row.id).length }],
              clause_review_decisions: [{ count: [...decisions.values()].filter((decision) => decision.contract_id === row.id).length }],
            }));
            resolve({ data });
          }
        },
      };
    },
  };
  return buildApp({ store, initialize: async () => {} });
}

test('owner can create, read, edit and reopen a decision, with queue progress reflecting each write', async (t) => {
  const app = await testApp();
  t.after(() => app.close());
  const write = (payload) => app.inject({ method: 'PUT', url: url(), headers: owner, payload });
  const preflight = await app.inject({
    method: 'OPTIONS', url: url(), headers: { origin: owner.origin, 'access-control-request-method': 'PUT' },
  });
  assert.match(preflight.headers['access-control-allow-methods'], /PUT/);
  assert.deepEqual((await app.inject({ url: '/contracts', headers: owner })).json()[0].reviewProgress, { total: 1, decided: 0 });
  const saved = await write({ outcome: 'revise', note: ' Ask for a fixed cap. ' });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().review.note, 'Ask for a fixed cap.');
  const clauses = () => app.inject({ url: `/contracts/${a}/clauses`, headers: owner });
  assert.deepEqual((await clauses()).json()[0].review, saved.json().review);
  assert.deepEqual((await app.inject({ url: '/contracts', headers: owner })).json()[0].reviewProgress, { total: 1, decided: 1 });
  assert.equal((await write({ outcome: 'accepted' })).json().review.outcome, 'accepted');
  for (let i = 0; i < 2; i++) assert.deepEqual((await write({ outcome: null })).json(), { review: null });
  assert.equal((await clauses()).json()[0].review, undefined);
});

test('decision writes verify ownership and clause membership and reject invalid data', async (t) => {
  const app = await testApp();
  t.after(() => app.close());
  const write = (target, payload, headers = owner) => app.inject({ method: 'PUT', url: target, headers, payload });
  assert.equal((await write(url(), { outcome: 'accepted' }, {})).statusCode, 401);
  assert.equal((await write(url(b, clauseB), { outcome: 'accepted' })).statusCode, 404);
  assert.equal((await write(url(a, clauseB), { outcome: null })).statusCode, 404);
  for (const payload of [
    { outcome: 'escalate', note: '    ' },
    { outcome: 'accepted', note: 'x'.repeat(1001) },
    { outcome: 'approved' },
    { outcome: null, note: 'unexpected' },
  ]) assert.equal((await write(url(), payload)).statusCode, 400);
});

test('unfinished analyses cannot receive decisions', async (t) => {
  const app = await testApp('processing');
  t.after(() => app.close());
  const response = await app.inject({ method: 'PUT', url: url(), headers: owner, payload: { outcome: 'accepted' } });
  assert.equal(response.statusCode, 409);
});
