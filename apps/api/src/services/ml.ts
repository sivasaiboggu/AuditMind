import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export interface MLClassification {
  label: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
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
    return { label: 'critical', confidence: 0.9 };
  }

  // Rules for high risk
  if (
    lowercase.includes('indemnify') ||
    lowercase.includes('intellectual property') ||
    lowercase.includes('sole discretion') ||
    lowercase.includes('limitation of liability') ||
    lowercase.includes('material breach')
  ) {
    return { label: 'high', confidence: 0.8 };
  }

  // Rules for medium risk
  if (
    lowercase.includes('automatically renew') ||
    lowercase.includes('exclusive jurisdiction') ||
    lowercase.includes('governed by the laws') ||
    lowercase.includes('confidentiality')
  ) {
    return { label: 'medium', confidence: 0.75 };
  }

  // Fallback for low risk
  return { label: 'low', confidence: 0.6 };
}

/**
 * Classifies a clause's risk tier using local Python ML Service, falling back to rules if offline.
 */
export async function classifyClauseRisk(text: string): Promise<MLClassification> {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/classify-clause`, { text }, { timeout: 2000 });
    return {
      label: response.data.label as any,
      confidence: response.data.confidence || 0.85
    };
  } catch (error) {
    // Graceful fallback to rule-based evaluation
    return fallbackClassify(text);
  }
}

/**
 * Gets a precise risk score percentage (0-100) for a clause or document.
 */
export async function getRiskScore(text: string): Promise<number> {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/risk-score`, { text }, { timeout: 2000 });
    return response.data.score;
  } catch (error) {
    // Map class labels to base risk percentages
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
