import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export interface MLClassification {
  label: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  method?: string;
  calibrated?: boolean;
}

/**
 * Heuristic/rule-based fallback classifier when FastAPI is offline.
 */
function fallbackClassify(text: string): MLClassification {
  const lowercase = text.toLowerCase();

  // Rules for critical legal issues
  if (
    (lowercase.includes('liquidated damages') && lowercase.includes('unrestricted')) ||
    (lowercase.includes('indemnify') && lowercase.includes('negligence') && lowercase.includes('disclosing')) ||
    lowercase.includes('perpetual, irrevocable') ||
    lowercase.includes('waives all rights to trial by jury')
  ) {
    return { label: 'critical', confidence: 0.9, method: 'api_heuristic_review_rules', calibrated: false };
  }

  // Rules for high risk
  if (
    lowercase.includes('indemnify') ||
    lowercase.includes('intellectual property') ||
    lowercase.includes('sole discretion') ||
    lowercase.includes('limitation of liability') ||
    lowercase.includes('material breach')
  ) {
    return { label: 'high', confidence: 0.8, method: 'api_heuristic_review_rules', calibrated: false };
  }

  // Rules for medium risk
  if (
    lowercase.includes('automatically renew') ||
    lowercase.includes('exclusive jurisdiction') ||
    lowercase.includes('governed by the laws') ||
    lowercase.includes('confidentiality')
  ) {
    return { label: 'medium', confidence: 0.75, method: 'api_heuristic_review_rules', calibrated: false };
  }

  // Fallback for low risk
  return { label: 'low', confidence: 0.6, method: 'api_heuristic_review_rules', calibrated: false };
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
    // Map rule labels to uncalibrated review-priority points, not percentages
    const classification = fallbackClassify(text);
    let base = 20;
    if (classification.label === 'critical') base = 85;
    else if (classification.label === 'high') base = 65;
    else if (classification.label === 'medium') base = 45;
    
    // Add minor variation based on text length
    const variance = Math.min(10, Math.floor(text.length / 100));
    return Math.min(100, base + variance);
  }
}
