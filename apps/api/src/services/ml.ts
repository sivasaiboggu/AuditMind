import axios from 'axios';

// The Python ML service rejects clauses over 20,000 chars (422), so the
// offline fallback must scan the same bounded input or the two paths would
// disagree on long clauses. Keep in sync with MAX_CLAUSE_CHARS in
// apps/ml-service/main.py.
export const MAX_CLAUSE_CHARS = 20000;

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export interface MLClassification {
  label: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  method?: string;
  calibrated?: boolean;
  /** The review pattern that fired, when the heuristic fallback classified it. */
  signal?: string;
}

/**
 * Heuristic fallback classifier when FastAPI is offline. Mirrors the
 * patterns, tier order, labels and confidences of the Python service's
 * compute_local_heuristics exactly: the offline path must never silently
 * assign a clause a different risk tier than the service would.
 * Uncalibrated review rules, not legal advice or trained-model probabilities.
 *
 * Two-part patterns are bounded to .{0,200} (see risk_rules.py): an
 * unbounded ".*" escalated any two words co-occurring anywhere in a long
 * clause. Word-family stems cover inflections the bare words missed
 * ("indemnification", "confidential information").
 */
const FALLBACK_RULES: [RegExp, MLClassification['label'], number][] = [
  [/liquidated damages/, 'critical', 0.88],
  [/perpetual.{0,200}irrevocable/, 'critical', 0.88],
  [/negligence.{0,200}disclosing/, 'critical', 0.88],
  [/indemnif\w*.{0,200}negligence/, 'critical', 0.88],
  [/indemnif\w*/, 'high', 0.79],
  [/intellectual property/, 'high', 0.79],
  [/sole discretion/, 'high', 0.79],
  [/limitation of liability/, 'high', 0.79],
  [/governing law/, 'high', 0.79],
  [/unlimited liability/, 'high', 0.79],
  [/non[-\s]?compete/, 'high', 0.79],
  [/automatic.{0,200}renew/, 'medium', 0.72],
  [/auto[-\s]?renew/, 'medium', 0.72],
  [/exclusive jurisdiction/, 'medium', 0.72],
  [/confidential/, 'medium', 0.72],
  [/force[-\s]?majeure/, 'medium', 0.72],
  [/terminat\w*.{0,40}without notice/, 'medium', 0.72],
];

function normalizeClause(text: unknown): string {
  if (typeof text !== 'string') throw new Error('Clause text must be a string.');
  if (!text.trim()) throw new Error('Clause text must not be empty.');
  // Match the service: "." never crosses newlines, so collapse whitespace
  // runs before matching or wrapped clauses silently miss two-part patterns.
  // Bound the scan to the same input the service accepts.
  return text.toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_CLAUSE_CHARS);
}

/** Raw input bounded to what the service accepts; case preserved for the model path. */
function boundedRaw(text: unknown): string {
  if (typeof text !== 'string') throw new Error('Clause text must be a string.');
  if (!text.trim()) throw new Error('Clause text must not be empty.');
  return text.slice(0, MAX_CLAUSE_CHARS);
}

/** Distinct review patterns matched; drives the risk-score signal modifier. */
function countFallbackMatches(normalized: string): number {
  let count = 0;
  for (const [pattern] of FALLBACK_RULES) {
    // Patterns are not global, so test() has no lastIndex state to reset.
    if (pattern.test(normalized)) count++;
  }
  return count;
}

export function fallbackClassify(text: string): MLClassification {
  const normalized = normalizeClause(text);
  for (const [pattern, label, confidence] of FALLBACK_RULES) {
    if (pattern.test(normalized)) {
      return { label, confidence, method: 'api_heuristic_review_rules', calibrated: false, signal: pattern.source };
    }
  }
  return { label: 'low', confidence: 0.62, method: 'api_heuristic_review_rules', calibrated: false };
}

/**
 * Classifies a clause's risk tier using local Python ML Service, falling back to rules if offline.
 */
export async function classifyClauseRisk(text: string): Promise<MLClassification> {
  const bounded = boundedRaw(text);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/classify-clause`, { text: bounded }, { timeout: 2000 });
    const { label, confidence } = response.data ?? {};
    if (!['low', 'medium', 'high', 'critical'].includes(label) ||
        typeof confidence !== 'number' || !Number.isFinite(confidence) ||
        confidence < 0 || confidence > 1) {
      throw new Error('Invalid risk classification response');
    }
    return { label, confidence,
      method: typeof response.data.method === 'string' ? response.data.method : 'unspecified',
      calibrated: false };

  } catch (error) {
    // Graceful fallback to rule-based evaluation. An empty clause throws
    // above instead of being fabricated as low risk.
    return fallbackClassify(text);
  }
}

/**
 * Gets an uncalibrated review-priority score (0-100), not a risk probability.
 */
export async function getRiskScore(text: string): Promise<number> {
  const bounded = boundedRaw(text);
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/risk-score`, { text: bounded }, { timeout: 2000 });
    const score = response.data?.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error('Invalid risk score response');
    }
    return score;
  } catch (error) {
    // Map rule labels to uncalibrated review-priority points, not percentages.
    // Same base scores, length modifier and signal modifier as the service's
    // /risk-score: +3 per extra distinct matched pattern, capped at +9.
    const classification = fallbackClassify(text);
    const baseScores = { critical: 82, high: 64, medium: 45, low: 18 } as const;
    const words = bounded.trim().split(/\s+/).filter(Boolean).length;
    const lengthMod = Math.min(15, Math.floor(words / 8));
    const signals = countFallbackMatches(normalizeClause(text));
    const signalMod = signals > 0 ? 3 * Math.min(3, signals - 1) : 0;
    return Math.min(100, baseScores[classification.label] + lengthMod + signalMod);
  }
}
