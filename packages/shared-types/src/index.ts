export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ContractStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Contract {
  id: string;
  userId: string;
  name: string;
  filePath: string;
  status: ContractStatus;
  overallRiskScore: number; // 0 to 100
  createdAt: string;
  updatedAt: string;
}

export interface Clause {
  id: string;
  contractId: string;
  number: string;      // e.g. "Section 4.2" or "1.1"
  title: string;       // e.g. "Indemnification" or "Confidentiality"
  text: string;        // original text of the clause
  riskLevel: RiskLevel;
  riskExplanation: string; // plain English explanation
  suggestedRedline?: string; // proposed safer alternative text
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
  stage: 'extracting' | 'segmenting' | 'classifying' | 'retrieving' | 'generating' | 'completed' | 'failed';
  message: string;
  percent: number;
}
