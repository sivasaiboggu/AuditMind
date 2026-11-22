export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ContractStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Contract {
  id: string;
  userId: string;
  name: string;
  filePath: string;
  status: ContractStatus;
  processingAttempts?: number;
  processingError?: string | null;
  nextRetryAt?: string | null;
  overallRiskScore: number; // 0 to 100
  createdAt: string;
  updatedAt: string;
  reviewProgress?: { total: number; decided: number };
}

export const REVIEW_OUTCOMES = ['accepted', 'revise', 'escalate'] as const;
export type ReviewOutcome = typeof REVIEW_OUTCOMES[number];

export interface ClauseReview {
  outcome: ReviewOutcome;
  note: string;
  updatedAt: string;
}

export interface Clause {
  id: string;
  contractId: string;
  number: string;      // e.g. "Section 4.2" or "1.1"
  title: string;       // e.g. "Indemnification" or "Confidentiality"
  text: string;        // original text of the clause
  riskLevel: RiskLevel;
  /** Per-clause review-priority score (0–100), uncalibrated — the same
   * score the pipeline stores and averages into the contract's overall
   * score. Absent when no score was stored for the clause. */
  riskScore?: number;
  /** The exact words in the clause that earned its risk tier, stored by
   * the pipeline. Absent when no rule fired (or the tier came from a
   * model, which names no words) — never invented. */
  matchedTerms?: string[];
  riskExplanation: string; // plain English explanation
  suggestedRedline?: string; // proposed safer alternative text
  review?: ClauseReview;
}

export interface RiskReport {
  id: string;
  contractId: string;
  summary: string;     // general summary of the contract risks
  redlines: string;    // markdown containing diffs / edits
  createdAt: string;
}

export interface ChatSession {
  id: string;
  contractId: string;
  userId: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  message: string;
  createdAt: string;
}

export interface ProcessingProgress {
  contractId: string;
  // 'pending' is the upload stage, before the pipeline's own stages begin.
  stage: 'pending' | 'extracting' | 'segmenting' | 'classifying' | 'retrieving' | 'generating' | 'completed' | 'failed';
  message: string;
  percent: number;
}
