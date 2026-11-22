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
  /** The exact words in the clause that earned the tier — the evidence
   * behind the score, never the regex source. Empty when no rule fired. */
  matched?: string[];
}

/**
 * Heuristic fallback classifier when FastAPI is offline. Mirrors the
 * patterns, tier order, labels, confidences and probes of the Python
 * service's risk_rules.py exactly: the offline path must never silently
 * assign a clause a different risk tier than the service would.
 * Uncalibrated review rules, not legal advice or trained-model probabilities.
 *
 * Each rule is [pattern, label, confidence, probes]: the pattern decides
 * the tier, the probes name the exact words it fired on.
 *
 * Two-part patterns are bounded to .{0,200} (see risk_rules.py): an
 * unbounded ".*" escalated any two words co-occurring anywhere in a long
 * clause. Word-family stems cover inflections the bare words missed
 * ("indemnification", "confidential information").
 *
 * Every pattern starts at a word boundary: substring matching counted
 * "determination" as "terminate ... without notice". The confidential rule
 * also refuses a "non-" prefix, so a clause saying information is
 * non-confidential is not flagged as a confidentiality risk.
 */
const FALLBACK_RULES: [RegExp, MLClassification['label'], number, RegExp[]][] = [
  [/\bliquidated damages/, 'critical', 0.88, [/\bliquidated damages/]],
  [/\bperpetual.{0,200}\birrevocable/, 'critical', 0.88,
   [/\bperpetual\w*/, /\birrevocable\w*/]],
  [/\bnegligence.{0,200}\bdisclosing/, 'critical', 0.88,
   [/\bnegligence\w*/, /\bdisclosing\w*/]],
  [/\bindemnif\w*.{0,200}\bnegligence/, 'critical', 0.88,
   [/\bindemnif\w*/, /\bnegligence\w*/]],
  [/\bindemnif\w*/, 'high', 0.79, [/\bindemnif\w*/]],
  [/\bintellectual property/, 'high', 0.79, [/\bintellectual property/]],
  [/\bsole discretion/, 'high', 0.79, [/\bsole discretion/]],
  [/\blimitation of liability/, 'high', 0.79, [/\blimitation of liability/]],
  [/\bgoverning law/, 'high', 0.79, [/\bgoverning law/]],
  [/\bunlimited liability/, 'high', 0.79, [/\bunlimited liability/]],
  [/\bnon[-\s]?compete/, 'high', 0.79, [/\bnon[-\s]?compete\w*/]],
  [/\bautomatic.{0,200}\brenew/, 'medium', 0.72,
   [/\bautomatic\w*/, /\brenew\w*/]],
  [/\bauto[-\s]?renew/, 'medium', 0.72, [/\bauto[-\s]?renew\w*/]],
  [/\bexclusive jurisdiction/, 'medium', 0.72, [/\bexclusive jurisdiction/]],
  [/(?<!non[-\s])\bconfidential/, 'medium', 0.72, [/\bconfidential\w*/]],
  [/\bforce[-\s]?majeure/, 'medium', 0.72, [/\bforce[-\s]?majeure\w*/]],
  [/\bterminat\w*.{0,40}\bwithout notice/, 'medium', 0.72,
   [/\bterminat\w*/, /\bwithout notice/]],
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

/** One word list per matched rule, in tier order — the same shape as the
 * Python service's match_review_patterns. A probe only runs for a rule
 * that already matched, so it can only name words that fired it. */
function matchReviewPatterns(normalized: string): string[][] {
  const matched: string[][] = [];
  for (const [pattern, , , probes] of FALLBACK_RULES) {
    if (!pattern.test(normalized)) continue;
    const terms: string[] = [];
    for (const probe of probes) {
      const found = probe.exec(normalized);
      if (found) terms.push(found[0]);
    }
    matched.push(terms);
  }
  return matched;
}

/** The exact words that earned the clause its tier, de-duplicated in
 * first-match order. Mirrors the Python service's matched_terms. */
export function matchedTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const group of matchReviewPatterns(normalizeClause(text))) {
    for (const term of group) {
      if (!seen.has(term)) {
        seen.add(term);
        terms.push(term);
      }
    }
  }
  return terms;
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
  for (const [pattern, label, confidence, probes] of FALLBACK_RULES) {
    if (pattern.test(normalized)) {
      const matched: string[] = [];
      for (const probe of probes) {
        const found = probe.exec(normalized);
        if (found) matched.push(found[0]);
      }
      return { label, confidence, method: 'api_heuristic_review_rules', calibrated: false, matched };
    }
  }
  return { label: 'low', confidence: 0.62, method: 'api_heuristic_review_rules', calibrated: false, matched: [] };
}

/** A service `matched` value is only trusted when it is an array of
 * non-empty strings; anything else is dropped rather than surfaced. */
function validMatched(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const terms = value.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  return terms.length === value.length ? terms : undefined;
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
    const matched = validMatched(response.data.matched);
    return { label, confidence,
      method: typeof response.data.method === 'string' ? response.data.method : 'unspecified',
      calibrated: false,
      // The service names the words that fired; a model response carries
      // none, so the field is absent rather than invented.
      ...(matched !== undefined ? { matched } : {}) };

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
