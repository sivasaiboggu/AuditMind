import { extractText, segmentClauses } from './parser.js';
import { classifyClauseRisk, getRiskScore } from './ml.js';
import { retrieveRegulations } from './rag.js';
import { analyzeClauseWithGemini, validateContractWithGemini } from './gemini.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/** Database job ledger is authoritative, created with contract metadata by trigger. */
let workerStarted = false;
export async function initializeQueue() {
  if (!supabase || workerStarted) return;
  workerStarted = true;
  void startQueueWorker();
}

export async function enqueueContractJob(contractId: string, _filePath: string, _mimeType: string, _buffer: Buffer) {
  if (!supabase) throw new Error('Contract job storage is not configured.');
  const { data, error } = await supabase.from('contract_jobs').select('contract_id').eq('contract_id', contractId).maybeSingle();
  if (error || !data) throw new Error('Durable job acceptance could not be confirmed.');
}

export async function runDurableJob(store: any, process = processContract): Promise<boolean> {
  const { data, error } = await store.rpc('claim_contract_job');
  if (error) throw new Error('Durable job claim failed.');
  const job = data?.[0];
  if (!job) return false;
  // An expired lease is fenced at commit/failure. Heartbeats reduce re-delivery
  // during slow providers but never grant authority after a lost lease.
  let renewing = false;
  let leaseCurrent = true;
  const heartbeat = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try {
      const result = await store.rpc('renew_contract_job', { p_contract_id: job.contract_id, p_lease_token: job.lease_token });
      if (result.error || result.data !== true) leaseCurrent = false;
    }
    catch { leaseCurrent = false; console.error('Job lease renewal could not be confirmed.'); }
    finally { renewing = false; }
  }, 30000);
  try {
    const { data: file, error: downloadError } = await store.storage.from('contracts').download(job.file_path);
    if (downloadError || !file) throw new Error('Job file could not be retrieved.');
    const buffer = Buffer.from(await file.arrayBuffer());
    await process(job.contract_id, job.file_path, job.mime_type, buffer, undefined, job.lease_token, () => leaseCurrent);
  } catch {
    // Download/transport failures are retryable after lease expiry. A missing
    // response does not mean the object or a committed result is absent.
    console.error('Durable job attempt interrupted; bounded recovery remains pending.');
    try { await store.rpc('retry_contract_job', { p_contract_id: job.contract_id, p_lease_token: job.lease_token }); }
    catch { console.error('Retry scheduling could not be confirmed; lease expiry will reconcile.'); }
  } finally { clearInterval(heartbeat); }
  return true;
}

async function startQueueWorker() {
  while (workerStarted && supabase) {
    try { if (await runDurableJob(supabase)) continue; }
    catch { console.error('Durable queue poll failed.'); }
    await new Promise(resolve => setTimeout(resolve, 15000));
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
  },
  leaseToken?: string,
  leaseCurrent: () => boolean = () => true
) {
  console.log(`// [Queue] Processing Contract ID: ${contractId}`);
  let persistenceStarted = false;
  try {
    if (!leaseCurrent()) return;
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
          if (!leaseCurrent()) throw new Error('Job lease unavailable.');
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

          if (!leaseCurrent()) throw new Error('Job lease unavailable.');
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
    if (!leaseCurrent()) return;
    persistenceStarted = true;
    const { error: commitError } = await deps.store.rpc(leaseToken ? 'complete_contract_job' : 'commit_contract_analysis', {
      ...(leaseToken ? { p_lease_token: leaseToken } : {}),
      p_contract_id: contractId,
      p_clauses: clausesToSave,
      p_overall_score: overallScore
    });
    if (commitError) throw new Error('Analysis persistence could not be confirmed.');

    // 5. Complete
    deps.progress(contractId, 'completed', 100, 'Compliance inspection fully generated.');
    console.log(`// [Queue] Completed processing contract ${contractId} successfully.`);
  } catch (error) {
    if (!leaseCurrent()) return;
    console.error('Contract processing failed.');
    deps.progress(contractId, 'failed', 0, persistenceStarted
      ? 'Analysis completion could not be confirmed. Check the dashboard before retrying; stored results may already have committed.'
      : 'Contract analysis did not finish. Review is required before relying on any results.');
    
    // A transport failure may follow a successful transaction. Do not turn an
    // unknown commit into a terminal failure or invite a duplicate submission.
    if (deps.store && !persistenceStarted) {
      const { error: statusError } = leaseToken
        ? await deps.store.rpc('fail_contract_job', { p_contract_id: contractId, p_lease_token: leaseToken })
        : await deps.store.from('contracts').update({ status: 'failed' }).eq('id', contractId).eq('status', 'processing');
      if (statusError) console.error('Failed analysis status could not be persisted; reconciliation is required.');
    }
  }
}
