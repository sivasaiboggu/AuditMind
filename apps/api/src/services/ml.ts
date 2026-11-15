import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export interface MLClassification {
  label: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  method?: string;
  calibrated?: boolean;
}

/**
 * Heuristic fallback classifier when FastAPI is offline. Mirrors the
 * patterns, tier order, labels and confidences of the Python service's
 * compute_local_heuristics exactly: the offline path must never silently
 * assign a clause a different risk tier than the service would.
 * Uncalibrated review rules, not legal advice or trained-model probabilities.
 */
const FALLBACK_RULES: [RegExp, MLClassification['label'], number][] = [
  [/liquidated damages/, 'critical', 0.88],
  [/perpetual.*irrevocable/, 'critical', 0.88],
  [/negligence.*disclosing/, 'critical', 0.88],
  [/indemnify.*negligence/, 'critical', 0.88],
  [/indemnify/, 'high', 0.79],
  [/intellectual property/, 'high', 0.79],
  [/sole discretion/, 'high', 0.79],
  [/limitation of liability/, 'high', 0.79],
  [/governing law/, 'high', 0.79],
  [/automatic.*renew/, 'medium', 0.72],
  [/exclusive jurisdiction/, 'medium', 0.72],
  [/confidentiality/, 'medium', 0.72],
  [/force majeure/, 'medium', 0.72],
];

export function fallbackClassify(text: string): MLClassification {
  // Match the service: "." never crosses newlines, so collapse whitespace
  // runs before matching or wrapped clauses silently miss two-part patterns.
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  for (const [pattern, label, confidence] of FALLBACK_RULES) {
    if (pattern.test(normalized)) {
      return { label, confidence, method: 'api_heuristic_review_rules', calibrated: false };
    }
  }
  return { label: 'low', confidence: 0.62, method: 'api_heuristic_review_rules', calibrated: false };
}

/**
 * Classifies a clause's risk tier using local Python ML Service, falling back to rules if offline.
 */
export async function classifyClauseRisk(text: string): Promise<MLClassification> {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/classify-clause`, { text }, { timeout: 2000 });
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
    // Graceful fallback to rule-based evaluation
    return fallbackClassify(text);
  }
}

/**
 * Gets an uncalibrated review-priority score (0-100), not a risk probability.
 */
export async function getRiskScore(text: string): Promise<number> {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/risk-score`, { text }, { timeout: 2000 });
    const score = response.data?.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error('Invalid risk score response');
    }
    return score;
  } catch (error) {
    // Map rule labels to uncalibrated review-priority points, not percentages.
    // Same base scores and length modifier as the service's /risk-score.
    const classification = fallbackClassify(text);
    const baseScores = { critical: 82, high: 64, medium: 45, low: 18 } as const;
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const lengthMod = Math.min(15, Math.floor(words / 8));
    return Math.min(100, baseScores[classification.label] + lengthMod);
  }
}
