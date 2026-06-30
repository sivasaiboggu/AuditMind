import { create } from 'zustand';
import type { Contract, Clause, RiskReport, ChatMessage, ProcessingProgress } from '@auditmind/shared-types';

interface ContractState {
  contracts: Contract[];
  activeContract: Contract | null;
  activeClauses: Clause[];
  activeReport: RiskReport | null;
  chatMessages: ChatMessage[];
  activeSessionId: string | null;
  isAnalyzing: boolean;
  progress: ProcessingProgress | null;
  user: any | null;
  
  setContracts: (contracts: Contract[]) => void;
  setActiveContract: (contract: Contract | null) => void;
  setActiveClauses: (clauses: Clause[]) => void;
  setActiveReport: (report: RiskReport | null) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setProgress: (progress: ProcessingProgress | null) => void;
  setUser: (user: any) => void;
}

export const useContractStore = create<ContractState>((set) => ({
  contracts: [],
  activeContract: null,
  activeClauses: [],
  activeReport: null,
  chatMessages: [],
  activeSessionId: null,
  isAnalyzing: false,
  progress: null,
  user: null,

  setContracts: (contracts) => set({ contracts }),
  setActiveContract: (activeContract) => set({ activeContract }),
  setActiveClauses: (activeClauses) => set({ activeClauses }),
  setActiveReport: (activeReport) => set({ activeReport }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setProgress: (progress) => set({ progress }),
  setUser: (user) => set({ user }),
}));
