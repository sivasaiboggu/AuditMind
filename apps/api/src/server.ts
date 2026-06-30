import './loadEnv.js';
import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { initializeQueue, enqueueContractJob, setProgressListener } from './services/queue.js';
import { streamChatWithGemini } from './services/gemini.js';
import { Contract, Clause } from '@auditmind/shared-types';

const PORT = parseInt(process.env.PORT || '3000', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const app = fastify({ logger: true });

// Registry of active WS clients by contract ID subscription
const progressSubscriptions = new Map<string, any>();

// Start Queue Service
await initializeQueue();

// Register plugins
await app.register(cors, { origin: '*' });
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

// Health check
app.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Upload Contract File
app.post('/contracts/upload', async (req, reply) => {
  const data = await req.file();
  if (!data) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }

  const contractId = randomUUID();
  const buffer = await data.toBuffer();
  const fileName = data.filename;
  const mimeType = data.mimetype;

  console.log(`// Ingesting contract: ${fileName} (${mimeType})`);

  let filePath = `contracts/${contractId}-${fileName}`;

  // Insert contract metadata
  const newContract: Contract = {
    id: contractId,
    userId: '',
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
      name: fileName,
      file_path: filePath,
      status: 'processing',
      overall_risk_score: 0
    });

  if (dbError) {
    console.error('Supabase DB error:', dbError);
    return reply.status(500).send({ error: 'Failed to record metadata' });
  }

  // Trigger Async Pipeline Job
  await enqueueContractJob(contractId, filePath, mimeType, buffer);

  return reply.status(201).send(newContract);
});

// Retrieve Contract List
app.get('/contracts', async (req, reply) => {
  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return reply.status(500).send({ error: error.message });
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

  // 1. Fetch file path to delete from Storage
  const { data: contract } = await supabase
    .from('contracts')
    .select('file_path')
    .eq('id', id)
    .single();

  if (contract?.file_path) {
    await supabase.storage.from('contracts').remove([contract.file_path]);
  }

  // 2. Delete database row
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id);

  if (error) return reply.status(500).send({ error: error.message });
  return { success: true };
});

// Retrieve Clauses for a Contract
app.get('/contracts/:id/clauses', async (req, reply) => {
  const { id } = req.params as { id: string };

  if (!supabase) {
    return reply.status(500).send({ error: 'Supabase database client is not configured.' });
  }

  const { data, error } = await supabase
    .from('clauses')
    .select('*')
    .eq('contract_id', id);

  if (error) return reply.status(500).send({ error: error.message });
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
          await streamChatWithGemini(messages, clausesText, (token) => {
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

// Launch server
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`// Fastify API running at http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
