import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest { authenticatedUserId: string | null; }
}

export interface IdentityStore {
  auth: { getUser(token: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
}

export async function verifiedUserId(store: IdentityStore | null, token: unknown): Promise<string | null> {
  if (!store || typeof token !== 'string' || token.length === 0 || token.length > 16384) return null;
  try {
    const { data, error } = await store.auth.getUser(token);
    return !error && data.user?.id ? data.user.id : null;
  } catch { return null; }
}

export function installContractAuth(app: FastifyInstance, store: IdentityStore | null) {
  app.decorateRequest('authenticatedUserId', null);
  app.addHook('onRequest', async (req, reply) => {
    // CORS preflight carries no bearer token. The subsequent request is verified.
    if (req.method === 'OPTIONS') return;
    if (!req.url.split('?')[0].match(/^\/contracts(?:\/|$)/)) return;
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/i.exec(header) : null;
    const id = await verifiedUserId(store, match?.[1]);
    if (!id) return reply.code(401).send({ error: 'Authentication required.' });
    req.authenticatedUserId = id;
  });
}

export async function ownedContract(store: any, contractId: unknown, userId: string | null) {
  if (!store || !userId || typeof contractId !== 'string' || contractId.length > 128) return null;
  const { data, error } = await store.from('contracts').select('id, file_path, status')
    .eq('id', contractId).eq('user_id', userId).maybeSingle();
  return error ? null : data;
}
