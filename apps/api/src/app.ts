import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { z } from 'zod';
import { initializeQueue, enqueueContractJob, setProgressListener } from './services/queue.js';
import { streamChatWithGemini } from './services/gemini.js';
import { installContractAuth, ownedContract, verifiedUserId } from './security.js';
import { sortClausesByNumber } from './services/clauseOrder.js';
import { Contract, Clause } from '@auditmind/shared-types';

export interface AppDependencies {
  store?: SupabaseClient | null;
  initialize?: () => Promise<void>;
  enqueue?: typeof enqueueContractJob;
  streamChat?: typeof streamChatWithGemini;
  registerProgress?: typeof setProgressListener;
}

// Single source of truth for the API version: apps/api/package.json.
// The health endpoint used to hard-code '1.0.0' while the package was
// already at 1.0.2, so monitors saw a stale version.
const { version: API_VERSION } = createRequire(import.meta.url)('../package.json') as { version: string };

/** CORS origins must be explicit http(s) origins. A FRONTEND_URL of "*" or
 * a non-URL value would silently allow any site to call the API with the
 * user's credentials, so invalid values are dropped, never trusted. */
export function resolveCorsOrigins(): string[] {
  const candidates = [
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.FRONTEND_URL || 'http://localhost:5173'
  ];
  const origins: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim().replace(/\/+$/, '');
    if (trimmed === '*' || !/^https?:\/\/[^/]+$/.test(trimmed)) {
      if (candidate.trim()) console.warn(`Ignoring invalid CORS origin: ${candidate}`);
      continue;
    }
    if (!origins.includes(trimmed)) origins.push(trimmed);
  }
  return origins.length > 0 ? origins : ['http://localhost:5173'];
}

/** Bounded list pagination: unbounded selects returned every row a user
 * ever uploaded. Defaults keep existing callers unchanged. */
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

function parsePagination(req: { query: unknown }): { limit: number; offset: number } | null {
  const parsed = paginationSchema.safeParse(req.query ?? {});
  return parsed.success ? parsed.data : null;
}

/** The overall score is defined as 0–100. A stored null, a non-number or
 * an out-of-range value must reach the UI as the unreviewed placeholder
 * 0, never as `null` (which rendered as "null%") or NaN. */
function boundedScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Build the real routes without listening, allowing isolated integration tests. */
export async function buildApp(deps: AppDependencies = {}) {
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = 'store' in deps ? (deps.store ?? null) : (url && key ? createClient(url, key) : null);
const enqueue = deps.enqueue || enqueueContractJob;
const streamChat = deps.streamChat || streamChatWithGemini;
const app = fastify({ logger: true });
installContractAuth(app, supabase);

// One error shape everywhere: { error }. Fastify's default validation and
// 404 bodies ({ statusCode, error, message }) leaked through before, so
// clients saw two shapes and 5xx details. Server faults stay generic.
app.setErrorHandler((error, _req, reply) => {
  const status = typeof (error as { statusCode?: unknown }).statusCode === 'number'
    ? (error as { statusCode: number }).statusCode : 500;
  if (status >= 500) app.log.error(error);
  reply.status(status).send({
    error: status >= 500 ? 'Internal server error.' : (error.message || 'Invalid request.'),
  });
});
app.setNotFoundHandler((_req, reply) => {
  reply.status(404).send({ error: 'Route not found.' });
});

// Registry of active WS clients by contract ID subscription
const progressSubscriptions = new Map<string, Set<any>>();

// Start Queue Service
await (deps.initialize || initializeQueue)();

// Register plugins
await app.register(cors, {
  origin: resolveCorsOrigins(),
  credentials: true
});
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

// Register websocket progress listener
(deps.registerProgress || setProgressListener)((contractId, stage, percent, message) => {
  const sockets = progressSubscriptions.get(contractId);
  if (!sockets) return;
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(JSON.stringify({
      type: 'progress', data: { contractId, stage, percent, message }
    }));
  }
});

/**
 * REST ENDPOINTS
 */

// Health check — used by Vercel, Railway, and uptime monitors
app.get('/health', async () => {
  return {
    status: 'healthy',
    service: 'AuditMind API',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    database: supabase ? 'configured, connectivity not checked' : 'not configured',
    queue: 'database job ledger; schema and connectivity not checked',
    environment: process.env.NODE_ENV || 'development'
  };
});

// Upload Contract File
app.post('/contracts/upload', async (req, reply) => {
  // A truncated or malformed multipart body throws inside req.file() /
  // toBuffer(); without this the framework answered 500 for a client error.
  let data: Awaited<ReturnType<typeof req.file>>;
  let buffer: Buffer;
  try {
    data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });
    buffer = await data.toBuffer();
  } catch {
    return reply.status(400).send({ error: 'The uploaded file could not be read. Upload a complete PDF, DOCX or plain-text file.' });
  }

  const userId = req.authenticatedUserId!;

  const contractId = randomUUID();
  const mimeType = data.mimetype;
  if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(mimeType)) {
    return reply.code(415).send({error:'Unsupported document type. Use PDF, DOCX or plain text.'});
  }
  if (buffer.length === 0) return reply.code(400).send({error:'The uploaded file is empty.'});
  // Strip path separators, then anything unsafe; '.' and '..' on their own
  // are not filenames, and a name of only dots would make a confusing key.
  const rawName = (data.filename || '').split(/[\\/]/).pop() || '';
  const cleaned = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+$/, '').slice(-120);
  const fileName = cleaned || 'contract';

  let filePath = `contracts/${contractId}-${fileName}`;

  // Insert contract metadata
  const newContract: Contract = {
    id: contractId,
    userId: userId || '',
    name: fileName,
    filePath,
    status: 'processing',
    overallRiskScore: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  // Upload actual file to Supabase Storage
  const { error: sError } = await supabase.storage
    .from('contracts')
    .upload(filePath, buffer, { contentType: mimeType });

  if (sError) {
    console.error('Contract storage upload could not be confirmed.');
    return reply.status(500).send({ error: 'Failed to upload contract to storage' });
  }

  const { error: dbError } = await supabase
    .from('contracts')
    .insert({
      id: contractId,
      user_id: userId || null,
      name: fileName,
      file_path: filePath,
      mime_type: mimeType,
      status: 'processing',
      overall_risk_score: 0
    });

  if (dbError) {
    // Only compensate a definite statement rejection. A lost response or
    // timeout may follow a committed insert; deleting its file would corrupt it.
    const rejected = typeof dbError.code === 'string' && /^(22|23|42)[0-9A-Z]{3}$/.test(dbError.code);
    if (!rejected) return reply.status(503).send({
      error: 'Metadata creation could not be confirmed. File retained for operator review before retrying.',
      code: 'UPLOAD_ACCEPTANCE_UNKNOWN', contractId
    });
    // Compensate only this request's newly generated object path. Never leave
    // an unreported orphan when metadata creation fails.
    let cleanupFailed = false;
    try {
      const cleanup = await supabase.storage.from('contracts').remove([filePath]);
      cleanupFailed = Boolean(cleanup.error);
    } catch { cleanupFailed = true; }
    return reply.status(500).send({
      error: cleanupFailed
        ? 'Metadata creation failed and file cleanup needs operator review.'
        : 'Metadata creation failed. The newly uploaded file was removed.',
      code: cleanupFailed ? 'UPLOAD_CLEANUP_PENDING' : 'UPLOAD_ROLLED_BACK',
      contractId
    });
  }

  // Trigger Async Pipeline Job
  try {
    await enqueue(contractId, filePath, mimeType, buffer);
  } catch {
    // Queue acceptance may be ambiguous. Keep the owned record/file for
    // reconciliation, do not enqueue again or claim processing succeeded.
    return reply.status(503).send({
      error: 'Queue acceptance could not be confirmed. Check this contract before uploading again.',
      code: 'QUEUE_ACCEPTANCE_UNKNOWN', contractId
    });
  }

  return reply.status(201).send(newContract);
});

app.get('/contracts', async (req, reply) => {
  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  const userId = req.authenticatedUserId!;
  const pagination = parsePagination(req);
  if (!pagination) {
    return reply.status(400).send({ error: 'Invalid pagination parameters. Use limit 1-100 and offset 0 or more.' });
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (error) return reply.status(500).send({ error: 'The database request could not be completed.' });
  return data.map(item => ({
    id: item.id,
    userId: item.user_id,
    name: item.name,
    filePath: item.file_path,
    status: item.status,
    processingAttempts: item.processing_attempts || 0,
    processingError: item.processing_error || null,
    nextRetryAt: item.next_retry_at || null,
    overallRiskScore: boundedScore(item.overall_risk_score),
    createdAt: item.created_at,
    updatedAt: item.updated_at
  }));
});

// Delete Contract Endpoint
app.delete('/contracts/:id', async (req, reply) => {
  const { id } = req.params as { id: string };

  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  const contract = await ownedContract(supabase, id, req.authenticatedUserId);
  if (!contract) return reply.code(404).send({ error: 'Contract not found.' });
  // A running pipeline may still write clauses. Never race deletion against it.
  if (contract.status === 'processing') {
    return reply.code(409).send({ error: 'This contract is still processing. Wait for it to finish before deleting.' });
  }
  if (typeof contract.file_path !== 'string' || !contract.file_path.trim()) {
    return reply.code(409).send({ error: 'The stored contract path is unavailable. Metadata was kept for review.' });
  }
  // Retry uses the same owned object path after a metadata failure. Real
  // already-absent-object behavior still needs isolated Storage verification.
  const { error: storageError } = await supabase.storage.from('contracts').remove([contract.file_path]);
  if (storageError) return reply.status(500).send({ error: 'Could not remove the stored contract. The database record was kept for retry.' });

  // 2. Delete database row
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('user_id', req.authenticatedUserId!)
    .eq('id', id);

  if (error) return reply.status(500).send({ error: 'The file was removed, but metadata cleanup failed. Retry deletion to finish cleanup.', code: 'METADATA_CLEANUP_PENDING' });
  return { success: true };
});

// Retrieve Clauses for a Contract
app.get('/contracts/:id/clauses', async (req, reply) => {
  const { id } = req.params as { id: string };

  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  const contract = await ownedContract(supabase, id, req.authenticatedUserId);
  if (!contract) return reply.code(404).send({ error: 'Contract not found.' });
  if (contract.status !== 'completed') return reply.code(409).send({ error: 'Completed clause results are not available.' });

  const pagination = parsePagination(req);
  if (!pagination) {
    return reply.status(400).send({ error: 'Invalid pagination parameters. Use limit 1-100 and offset 0 or more.' });
  }

  // Clause numbers are text, so the database orders them lexicographically
  // ("Section 10" before "Section 2") and a paginated slice on that order
  // can strand a clause on the wrong page. The parser caps a contract at
  // 500 segments, so fetch the bounded set, order it naturally in memory,
  // and only then take the requested page.
  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('contract_id', id);

  if (error) return reply.status(500).send({ error: 'The database request could not be completed.' });
  const ordered = sortClausesByNumber(data ?? []);
  return ordered.slice(pagination.offset, pagination.offset + pagination.limit).map(c => ({
    id: c.id,
    contractId: c.contract_id,
    number: c.number,
    title: c.title,
    text: c.text,
    riskLevel: c.risk_level,
    // The pipeline stores a per-clause score and averages it into the
    // contract's overall score, but this endpoint used to drop it — the
    // review UI could only show the tier, never the number behind it.
    // Omit it when nothing valid was stored rather than inventing a 0.
    ...(typeof c.risk_score === 'number' && Number.isFinite(c.risk_score)
      ? { riskScore: c.risk_score }
      : {}),
    // The exact words that earned the tier, stored with the clause. Omit
    // when nothing was stored rather than inventing evidence.
    ...(Array.isArray(c.matched_terms) && c.matched_terms.length > 0 &&
       c.matched_terms.every((t: unknown) => typeof t === 'string' && t !== '')
      ? { matchedTerms: c.matched_terms }
      : {}),
    riskExplanation: c.risk_explanation,
    suggestedRedline: c.suggested_redline
  }));
});

/**
 * WEBSOCKET ENDPOINT (/ws)
 */
app.route({
  method: 'GET',
  url: '/ws',
  handler: (req, reply) => {
    reply.status(400).send({ error: 'WebSocket connection only' });
  },
  wsHandler: (conn, req) => {
    console.log('// New WebSocket client connection established.');

    let principal: string | null = null;
    let handling = false;
    const send = (frame: unknown) => {
      if (conn.socket.readyState === 1) conn.socket.send(JSON.stringify(frame));
    };
    conn.socket.on('message', async (message: string) => {
      // Async message callbacks otherwise overlap while token verification or
      // provider streaming awaits, mixing tokens from two independent answers.
      if (handling) { conn.socket.close(1008, 'Concurrent requests are not supported'); return; }
      handling = true;
      try {
        const payload = JSON.parse(message);

        // Tokens travel inside frames, never in URLs or access logs.
        const userId = await verifiedUserId(supabase, payload?.accessToken);
        if (principal && userId !== principal) { conn.socket.close(1008, 'Account changed'); return; }
        const contract = userId ? await ownedContract(supabase, payload?.contractId, userId) : null;
        if (!contract) {
          send({ type: 'error', message: 'Authentication or contract access denied.' });
          conn.socket.close(1008, 'Access denied');
          return;
        }
        principal = userId;
        if (conn.socket.readyState !== 1) return;
        if (payload.type === 'subscribe') {
          const { contractId } = payload;
          let sockets = progressSubscriptions.get(contractId);
          if (!sockets) { sockets = new Set(); progressSubscriptions.set(contractId, sockets); }
          sockets.add(conn.socket);
          console.log(`// WS: Client subscribed to updates for contract: ${contractId}`);

          send({
            type: 'subscribed',
            contractId
          });

          // Resolve race condition: Check if contract is already completed or failed in the DB
          if (supabase) {
            const { data: contract } = await supabase
              .from('contracts')
              .select('status')
              .eq('id', contractId)
              .single();

            if (contract) {
              if (contract.status === 'completed') {
                send({
                  type: 'progress',
                  data: {
                    contractId,
                    stage: 'completed',
                    percent: 100,
                    message: 'Compliance inspection fully generated.'
                  }
                });
              } else if (contract.status === 'failed') {
                send({
                  type: 'progress',
                  data: {
                    contractId,
                    stage: 'failed',
                    percent: 0,
                    message: 'Analysis pipeline failed.'
                  }
                });
              }
            }
          }
        }

        else if (payload.type === 'chat') {          const { contractId, messages } = payload;
          if (contract.status !== 'completed') throw new Error('Contract analysis is not complete.');
          if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40 ||
              messages.some(item => !item || !['user', 'model'].includes(item.role) ||
                typeof item.content !== 'string' || !item.content.trim() || item.content.length > 8000) ||
              messages.reduce((total, item) => total + item.content.length, 0) > 32000) {
            throw new Error('Invalid chat history.');
          }
          console.log(`// WS: Received chat request for contract ${contractId}`);

          // 1. Retrieve contract context (clauses)
          let clausesText = '';
          if (!supabase) {
            throw new Error('Supabase database client is not configured.');
          }
          const { data, error: contextError } = await supabase.from('clauses').select('number, title, text').eq('contract_id', contractId);
          if (contextError || !data?.length) throw new Error('Contract context is unavailable.');
          if (data) {
            clausesText = sortClausesByNumber(data).map(c => `${c.number} (${c.title}): ${c.text}`).join('\n\n');
          }

          // 2. Query Gemini streaming response
          await streamChat(messages, clausesText, (token) => {
            send({
              type: 'token',
              token
            });
          });

          // 3. Send final message end tag
          send({
            type: 'chat_end'
          });
        } else {
          // An authenticated but unknown message type used to be swallowed
          // silently; say so instead of leaving the client waiting.
          send({ type: 'error', message: 'Unsupported message type.' });
        }
      } catch (err) {
        console.error('WebSocket message could not be processed.');
        send({
          type: 'error',
          message: 'Failed to process message payload'
        });
      } finally { handling = false; }
    });

    conn.socket.on('close', () => {
      console.log('// WebSocket connection terminated by client.');
      // Cleanup subscriptions
      for (const [key, sockets] of progressSubscriptions.entries()) {
        sockets.delete(conn.socket);
        if (sockets.size === 0) progressSubscriptions.delete(key);
      }
    });
  }
});

return app;
}
