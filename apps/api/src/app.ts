import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { initializeQueue, enqueueContractJob, setProgressListener } from './services/queue.js';
import { streamChatWithGemini } from './services/gemini.js';
import { installContractAuth, ownedContract, verifiedUserId } from './security.js';
import { Contract, Clause } from '@auditmind/shared-types';

export interface AppDependencies {
  store?: SupabaseClient | null;
  initialize?: () => Promise<void>;
  enqueue?: typeof enqueueContractJob;
  streamChat?: typeof streamChatWithGemini;
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

// Registry of active WS clients by contract ID subscription
const progressSubscriptions = new Map<string, any>();

// Start Queue Service
await (deps.initialize || initializeQueue)();

// Register plugins
await app.register(cors, {
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    process.env.FRONTEND_URL || 'http://localhost:5173'
  ],
  credentials: true
});
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
await app.register(websocket);

// Register websocket progress listener
setProgressListener((contractId, stage, percent, message) => {
  const socket = progressSubscriptions.get(contractId);
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({
      type: 'progress',
      data: { contractId, stage, percent, message }
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
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    database: supabase ? 'configured, connectivity not checked' : 'not configured',
    environment: process.env.NODE_ENV || 'development'
  };
});

// Upload Contract File
app.post('/contracts/upload', async (req, reply) => {
  const data = await req.file();
  if (!data) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }

  const userId = req.authenticatedUserId!;

  const contractId = randomUUID();
  const mimeType = data.mimetype;
  if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(mimeType)) {
    return reply.code(415).send({error:'Unsupported document type. Use PDF, DOCX or plain text.'});
  }
  const buffer = await data.toBuffer();
  if (buffer.length === 0) return reply.code(400).send({error:'The uploaded file is empty.'});
  const fileName = data.filename.split(/[\\/]/).pop()!.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'contract';

  console.log(`// Ingesting contract: ${fileName} (${mimeType})`);

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
    console.error('Supabase upload error:', sError);
    return reply.status(500).send({ error: 'Failed to upload contract to storage' });
  }

  const { error: dbError } = await supabase
    .from('contracts')
    .insert({
      id: contractId,
      user_id: userId || null,
      name: fileName,
      file_path: filePath,
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

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return reply.status(500).send({ error: 'The database request could not be completed.' });
  return data.map(item => ({
    id: item.id,
    userId: item.user_id,
    name: item.name,
    filePath: item.file_path,
    status: item.status,
    overallRiskScore: item.overall_risk_score,
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

  if (!await ownedContract(supabase, id, req.authenticatedUserId)) {
    return reply.code(404).send({ error: 'Contract not found.' });
  }

  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('contract_id', id);

  if (error) return reply.status(500).send({ error: 'The database request could not be completed.' });
  return data.map(c => ({
    id: c.id,
    contractId: c.contract_id,
    number: c.number,
    title: c.title,
    text: c.text,
    riskLevel: c.risk_level,
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

    conn.socket.on('message', async (message: string) => {
      try {
        const payload = JSON.parse(message);

        // Tokens travel inside frames, never in URLs or access logs.
        const userId = await verifiedUserId(supabase, payload.accessToken);
        if (!userId || !await ownedContract(supabase, payload.contractId, userId)) {
          conn.socket.send(JSON.stringify({ type: 'error', message: 'Authentication or contract access denied.' }));
          conn.socket.close(1008, 'Access denied');
          return;
        }
        if (payload.type === 'subscribe') {
          const { contractId } = payload;
          progressSubscriptions.set(contractId, conn.socket);
          console.log(`// WS: Client subscribed to updates for contract: ${contractId}`);

          conn.socket.send(JSON.stringify({
            type: 'subscribed',
            contractId
          }));

          // Resolve race condition: Check if contract is already completed or failed in the DB
          if (supabase) {
            const { data: contract } = await supabase
              .from('contracts')
              .select('status')
              .eq('id', contractId)
              .single();

            if (contract) {
              if (contract.status === 'completed') {
                conn.socket.send(JSON.stringify({
                  type: 'progress',
                  data: {
                    contractId,
                    stage: 'completed',
                    percent: 100,
                    message: 'Compliance inspection fully generated.'
                  }
                }));
              } else if (contract.status === 'failed') {
                conn.socket.send(JSON.stringify({
                  type: 'progress',
                  data: {
                    contractId,
                    stage: 'failed',
                    percent: 0,
                    message: 'Analysis pipeline failed.'
                  }
                }));
              }
            }
          }
        }

        else if (payload.type === 'chat') {
          const { contractId, messages } = payload;
          console.log(`// WS: Received chat request for contract ${contractId}`);

          // 1. Retrieve contract context (clauses)
          let clausesText = '';
          if (!supabase) {
            throw new Error('Supabase database client is not configured.');
          }
          const { data } = await supabase.from('clauses').select('number, title, text').eq('contract_id', contractId);
          if (data) {
            clausesText = data.map(c => `${c.number} (${c.title}): ${c.text}`).join('\n\n');
          }

          // 2. Query Gemini streaming response
          await streamChat(messages, clausesText, (token) => {
            conn.socket.send(JSON.stringify({
              type: 'token',
              token
            }));
          });

          // 3. Send final message end tag
          conn.socket.send(JSON.stringify({
            type: 'chat_end'
          }));
        }
      } catch (err) {
        console.error('WS Message Handler Error:', err);
        conn.socket.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message payload'
        }));
      }
    });

    conn.socket.on('close', () => {
      console.log('// WebSocket connection terminated by client.');
      // Cleanup subscriptions
      for (const [key, val] of progressSubscriptions.entries()) {
        if (val === conn.socket) {
          progressSubscriptions.delete(key);
        }
      }
    });
  }
});

return app;
}
