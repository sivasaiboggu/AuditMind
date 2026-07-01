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
    progressListener(contractId, stage, percent, message);
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
        console.error('// Memory queue job processing failed:', err);
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
    console.warn('// Failed to initialize Upstash REST client, falling back to Memory Queue:', error);
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
        console.error('// [Worker] Upstash polling job processing error:', err);
      }
    }
    
    // Poll every 1.5 seconds to keep latency low without exceeding free tier requests
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/**
 * Ingestion Processing pipeline
 */
async function processContract(
  contractId: string,
  filePath: string,
  mimeType: string,
  buffer: Buffer
) {
  console.log(`// [Queue] Processing Contract ID: ${contractId}`);
  
  try {
    // 1. Text Extraction
    updateProgress(contractId, 'extracting', 15, 'Extracting text from document body...');
    const rawText = await extractText(buffer, mimeType);
    
    // Validate legal contract type
    updateProgress(contractId, 'extracting', 25, 'Validating document type...');
    const validation = await validateContractWithGemini(rawText);
    if (!validation.isContract) {
      throw new Error(validation.message);
    }
    
    // 2. Clause Segmentation
    updateProgress(contractId, 'segmenting', 35, 'Segmenting legal clauses...');
    const rawClauses = segmentClauses(rawText);

    // 3. Risk Classification & RAG & Gemini Summaries
    let completedClauses = 0;
    const clausesToSave = await Promise.all(
      rawClauses.map(async (item) => {
        try {
          // Run risk classification, scoring, and RAG retrieval in parallel
          const [classification, score, regContext] = await Promise.all([
            classifyClauseRisk(item.text),
            getRiskScore(item.text),
            retrieveRegulations(item.text)
          ]);
          const label = classification.label;

          // Call Gemini for redlines
          const analysis = await analyzeClauseWithGemini(item.title, item.text, regContext);

          completedClauses++;
          const percentage = 35 + Math.floor((completedClauses / rawClauses.length) * 50);
          updateProgress(
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
          console.error(`// Error processing clause "${item.title}":`, err);
          completedClauses++;
          return {
            contract_id: contractId,
            number: item.number,
            title: item.title,
            text: item.text,
            risk_level: 'low',
            risk_explanation: 'Failed to analyze this clause automatically.',
            suggested_redline: '',
            risk_score: 0
          };
        }
      })
    );

    let riskSum = 0;
    clausesToSave.forEach((c) => {
      riskSum += c.risk_score;
    });

    const overallScore = rawClauses.length > 0 ? Math.round(riskSum / rawClauses.length) : 0;

    // 4. Update Database
    updateProgress(contractId, 'generating', 90, 'Syncing details to secure storage vaults...');
    
    if (supabase) {
      // Save clauses
      const { error: cError } = await supabase.from('clauses').insert(clausesToSave);
      if (cError) throw cError;

      // Update contract status
      const { error: sError } = await supabase
        .from('contracts')
        .update({
          status: 'completed',
          overall_risk_score: overallScore
        })
        .eq('id', contractId);
      if (sError) throw sError;
    } else {
      console.log('// Supabase disconnected. Seed updates mocked locally.');
    }

    // 5. Complete
    updateProgress(contractId, 'completed', 100, 'Compliance inspection fully generated.');
    console.log(`// [Queue] Completed processing contract ${contractId} successfully.`);
  } catch (error) {
    console.error(`// [Queue] Processing failed for contract ${contractId}:`, error);
    updateProgress(contractId, 'failed', 0, (error as Error).message);
    
    if (supabase) {
      await supabase.from('contracts').update({ status: 'failed' }).eq('id', contractId);
    }
  }
}
