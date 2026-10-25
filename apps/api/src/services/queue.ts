import { Redis } from '@upstash/redis';
import { extractText, segmentClauses } from './parser.js';
import { classifyClauseRisk, getRiskScore } from './ml.js';
import { retrieveRegulations } from './rag.js';
import { analyzeClauseWithGemini, validateContractWithGemini } from './gemini.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Progress notification callback
export type ProgressCallback = (contractId: string, stage: string, percent: number, message: string) => void;
let progressListener: ProgressCallback | null = null;

export function setProgressListener(listener: ProgressCallback) {
  progressListener = listener;
}

function updateProgress(contractId: string, stage: string, percent: number, message: string) {
  if (progressListener) {
    try { progressListener(contractId, stage, percent, message); }
    catch { console.error('Progress notification could not be delivered.'); }
  }
}

// In-Memory Queue Fallback
class MemoryQueue {
  private queue: Array<{ contractId: string; filePath: string; mimeType: string; buffer: Buffer }> = [];
  private isProcessing = false;

  async add(contractId: string, filePath: string, mimeType: string, buffer: Buffer) {
    this.queue.push({ contractId, filePath, mimeType, buffer });
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    const job = this.queue.shift();
    if (job) {
      try {
        await processContract(job.contractId, job.filePath, job.mimeType, job.buffer);
      } catch (err) {
        console.error('Memory queue job could not be processed.');
      }
    }
    
    this.isProcessing = false;
    this.processNext();
  }
}

// Upstash REST Client Instance
let upstashClient: Redis | null = null;
const memoryQueue = new MemoryQueue();

// Initialize Queue setup
export async function initializeQueue() {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    console.log('// Upstash REST credentials not configured. Running in Memory Queue mode.');
    return;
  }

  try {
    upstashClient = new Redis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN
    });

    console.log('// Upstash REST Redis client initialized successfully.');
    
    // Start background polling loop for jobs
    startQueueWorker();
  } catch (error) {
    console.warn('Upstash initialization failed; memory queue is not durable.');
  }
}

/**
 * Add a contract job to Upstash Redis queue.
 */
export async function enqueueContractJob(
  contractId: string,
  filePath: string,
  mimeType: string,
  buffer: Buffer
) {
  if (upstashClient) {
    const payload = {
      contractId,
      filePath,
      mimeType,
      bufferBase64: buffer.toString('base64')
    };
    
    // Push job into Upstash list
    await upstashClient.lpush('auditmind:queue', JSON.stringify(payload));
    console.log(`// [Queue] Enqueued job in Upstash Redis list: contractId=${contractId}`);
  } else {
    await memoryQueue.add(contractId, filePath, mimeType, buffer);
  }
}

/**
 * Background Worker Polling Loop for Upstash REST Redis
 */
async function startQueueWorker() {
  console.log('// [Worker] Upstash Redis REST background polling loop active.');
  
  while (true) {
    if (upstashClient) {
      try {
        const rawJob = await upstashClient.rpop('auditmind:queue');
        if (rawJob) {
          const job = typeof rawJob === 'string' ? JSON.parse(rawJob) : rawJob;
          const buffer = Buffer.from(job.bufferBase64, 'base64');
          
          await processContract(job.contractId, job.filePath, job.mimeType, buffer);
        }
      } catch (err) {
        console.error('Queue worker request failed.');
      }
    }
    
    // Poll every 1.5 seconds to keep latency low without exceeding free tier requests
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/**
 * Ingestion Processing pipeline
 */
export async function processContract(
  contractId: string,
  filePath: string,
  mimeType: string,
  buffer: Buffer,
  deps = {
    store: supabase,
    extract: extractText,
    segment: segmentClauses,
    validate: validateContractWithGemini,
    classify: classifyClauseRisk,
    score: getRiskScore,
    retrieve: retrieveRegulations,
    analyze: analyzeClauseWithGemini,
    progress: updateProgress
  }
) {
  console.log(`// [Queue] Processing Contract ID: ${contractId}`);
  let persistenceStarted = false;
  try {
    if (!deps.store) throw new Error('Contract storage is not configured.');
    // 1. Text Extraction
    deps.progress(contractId, 'extracting', 15, 'Extracting text from document body...');
    const rawText = await deps.extract(buffer, mimeType);
    
    // Validate legal contract type
    deps.progress(contractId, 'extracting', 25, 'Validating document type...');
    const validation = await deps.validate(rawText);
    if (!validation.isContract) {
      throw new Error(validation.message);
    }
    
    // 2. Clause Segmentation
    deps.progress(contractId, 'segmenting', 35, 'Segmenting legal clauses...');
    const rawClauses = deps.segment(rawText);
    if (rawClauses.length === 0) throw new Error('No clauses could be extracted for review.');

    // 3. Risk Classification & RAG & Gemini Summaries
    let completedClauses = 0;
    const analyze = async (item: typeof rawClauses[number]) => {
        try {
          // Run risk classification, scoring, and RAG retrieval in parallel
          const [classification, score, regContext] = await Promise.all([
            deps.classify(item.text),
            deps.score(item.text),
            deps.retrieve(item.text)
          ]);
          const label = classification?.label;
          if (!['low', 'medium', 'high', 'critical'].includes(label) ||
              typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
            throw new Error('Invalid clause risk assessment.');
          }

          // Call Gemini for redlines
          const analysis = await deps.analyze(item.title, item.text, regContext);
          if (!analysis || typeof analysis.explanation !== 'string' || !analysis.explanation.trim() ||
              typeof analysis.suggestedRedline !== 'string') {
            throw new Error('Invalid clause explanation response.');
          }

          completedClauses++;
          const percentage = 35 + Math.floor((completedClauses / rawClauses.length) * 50);
          deps.progress(
            contractId,
            'classifying',
            percentage,
            `Processed clause ${completedClauses} of ${rawClauses.length}: ${item.title}`
          );

          return {
            contract_id: contractId,
            number: item.number,
            title: item.title,
            text: item.text,
            risk_level: label,
            risk_explanation: analysis.explanation,
            suggested_redline: analysis.suggestedRedline,
            risk_score: score
          };
        } catch (err) {
          console.error('Clause processing failed.');
          // A service failure is not a finding of low legal risk. Reject the
          // contract run instead of saving a fabricated zero-risk clause.
          throw new Error('Clause analysis was incomplete.');
        }
    };
    // Bound provider fan-out and settle the current batch before reporting a
    // failed job. Promise.all alone left sibling progress running after failure.
    const clausesToSave: Awaited<ReturnType<typeof analyze>>[] = [];
    for (let offset = 0; offset < rawClauses.length; offset += 4) {
      const results = await Promise.allSettled(rawClauses.slice(offset, offset + 4).map(analyze));
      if (results.some(result => result.status === 'rejected')) throw new Error('Clause analysis was incomplete.');
      for (const result of results) if (result.status === 'fulfilled') clausesToSave.push(result.value);
    }

    let riskSum = 0;
    clausesToSave.forEach((c) => {
      riskSum += c.risk_score;
    });

    const overallScore = rawClauses.length > 0 ? Math.round(riskSum / rawClauses.length) : 0;

    // 4. Update Database
    deps.progress(contractId, 'generating', 90, 'Syncing details to secure storage vaults...');
    
    // One transaction replaces old partial rows and commits the status/score.
    // This requires the reviewed source migration before deploying this API.
    persistenceStarted = true;
    const { error: commitError } = await deps.store.rpc('commit_contract_analysis', {
      p_contract_id: contractId,
      p_clauses: clausesToSave,
      p_overall_score: overallScore
    });
    if (commitError) throw new Error('Analysis persistence could not be confirmed.');

    // 5. Complete
    deps.progress(contractId, 'completed', 100, 'Compliance inspection fully generated.');
    console.log(`// [Queue] Completed processing contract ${contractId} successfully.`);
  } catch (error) {
    console.error('Contract processing failed.');
    deps.progress(contractId, 'failed', 0, persistenceStarted
      ? 'Analysis completion could not be confirmed. Check the dashboard before retrying; stored results may already have committed.'
      : 'Contract analysis did not finish. Review is required before relying on any results.');
    
    // A transport failure may follow a successful transaction. Do not turn an
    // unknown commit into a terminal failure or invite a duplicate submission.
    if (deps.store && !persistenceStarted) {
      const { error: statusError } = await deps.store.from('contracts').update({ status: 'failed' })
        .eq('id', contractId).eq('status', 'processing');
      if (statusError) console.error('Failed analysis status could not be persisted; reconciliation is required.');
    }
  }
}
