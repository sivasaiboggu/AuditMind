import { test } from 'node:test';
import assert from 'node:assert/strict';
import fastify from 'fastify';
import { installContractAuth, verifiedUserId, ownedContract } from '../dist/security.js';

const identities = {
  auth: { async getUser(token) {
    return token === 'valid-token'
      ? { data: { user: { id: 'user-a' } }, error: null }
      : { data: { user: null }, error: new Error('invalid') };
  } }
};

test('missing, malformed and unverified credentials are rejected', async () => {
  const app = fastify();
  installContractAuth(app, identities);
  app.get('/contracts', async req => ({ userId: req.authenticatedUserId }));
  app.get('/health', async () => ({ status: 'healthy' }));
  try {
    for (const authorization of [undefined, 'Basic valid-token', 'Bearer fake', 'Bearer valid-token extra']) {
      const response = await app.inject({ url: '/contracts?userId=user-b', headers: authorization ? { authorization } : {} });
      assert.equal(response.statusCode, 401);
    }
    assert.equal((await app.inject({ url: '/health' })).statusCode, 200);
  } finally { await app.close(); }
});

test('server-verified identity wins over caller-supplied userId', async () => {
  const app = fastify();
  installContractAuth(app, identities);
  app.get('/contracts', async req => ({ userId: req.authenticatedUserId }));
  try {
    const response = await app.inject({ url: '/contracts?userId=user-b', headers: { authorization: 'Bearer valid-token' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { userId: 'user-a' });
  } finally { await app.close(); }
});

test('verification failures and missing auth configuration fail closed', async () => {
  assert.equal(await verifiedUserId(null, 'valid-token'), null);
  assert.equal(await verifiedUserId(identities, null), null);
  assert.equal(await verifiedUserId({ auth: { getUser() { throw new Error('offline'); } } }, 'token'), null);
});

function fakeStore(owner) {
  return { from(table) {
    assert.equal(table, 'contracts');
    const filters = {};
    return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      async maybeSingle() { return { data: filters.id === 'contract-a' && filters.user_id === owner ? { id: 'contract-a' } : null, error: null }; }
    };
  } };
}

test('ownership check denies a different user and unknown contract', async () => {
  const store = fakeStore('user-a');
  assert.equal(await ownedContract(store, 'contract-a', 'user-b'), null);
  assert.equal(await ownedContract(store, 'other-contract', 'user-a'), null);
  assert.deepEqual(await ownedContract(store, 'contract-a', 'user-a'), { id: 'contract-a' });
});

test('ownership check rejects absent identity, store and invalid ID', async () => {
  assert.equal(await ownedContract(null, 'contract-a', 'user-a'), null);
  assert.equal(await ownedContract(fakeStore('user-a'), {}, 'user-a'), null);
  assert.equal(await ownedContract(fakeStore('user-a'), 'contract-a', null), null);
});
