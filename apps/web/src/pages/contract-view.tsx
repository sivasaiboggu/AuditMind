import { authenticatedFetch, sendAuthenticated } from '../lib/api';
import { buildReportMarkdown, reportFileName } from '../lib/report';
import { workspaceGuard } from '../lib/workspace-guard';
import { chatHistory, interruptChat, INCOMPLETE_ANSWER } from '../lib/chat-stream';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { useKeyboard } from '../hooks/useKeyboard';
import { Navbar } from '../components/Navbar';
import { Badge, Card, EmptyState, Skeleton } from '../components/ui';
import type { BadgeTone } from '../components/ui';
import { cn, copyToClipboard } from '../lib/utils';
import { AlertTriangle, ArrowLeft, Send, FileEdit, MessageSquareCode, FileText, Copy, CheckCheck, Wifi, WifiOff, Bot, Download, Search, X, GitCompare, Check } from 'lucide-react';
import type { Clause, ChatMessage, RiskLevel } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export default function ContractView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    setContracts,
    activeContract,
    setActiveContract,
    activeClauses,
    setActiveClauses,
    chatMessages,
    setChatMessages
  } = useContractStore();

  const [clausesLoading, setClausesLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedClause, setSelectedClause] = useState<Clause | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat' | 'compare'>('analysis');
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const failPendingChat = useRef<(() => void) | null>(null);

  // Review-panel controls: clause search, risk filter, compare mode.
  const [clauseQuery, setClauseQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | RiskLevel>('all');
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [exported, setExported] = useState(false);
  const exportedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredClauses = useMemo(() => {
    const query = clauseQuery.trim().toLowerCase();
    return activeClauses.filter((clause) => {
      if (riskFilter !== 'all' && clause.riskLevel !== riskFilter) return false;
      if (!query) return true;
      return [clause.number, clause.title, clause.text]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [activeClauses, clauseQuery, riskFilter]);

  const compareClauses = useMemo(
    () => compareIds
      .map((id) => activeClauses.find((c) => c.id === id))
      .filter((c): c is Clause => Boolean(c)),
    [compareIds, activeClauses],
  );

  /** Derived compare verdict — from the two clauses' own risk levels only. */
  const RISK_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const compareSummary = useMemo(() => {
    if (compareClauses.length !== 2) return null;
    const [a, b] = compareClauses;
    const rankA = RISK_RANK[a.riskLevel];
    const rankB = RISK_RANK[b.riskLevel];
    const label = (c: Clause) => c.number || c.title;
    return rankA === rankB
      ? 'Both clauses carry the same risk level — review the explanations below to see why.'
      : `${label(rankA > rankB ? a : b)} carries the higher risk. Start there.`;
  }, [compareClauses]);

  const riskCounts = useMemo(() => {
    const counts: Record<RiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const clause of activeClauses) counts[clause.riskLevel] += 1;
    return counts;
  }, [activeClauses]);

  const toggleCompare = (clause: Clause) => {
    let next: string[];
    if (compareIds.includes(clause.id)) {
      next = compareIds.filter((id) => id !== clause.id);
    } else if (compareIds.length >= 2) {
      next = [compareIds[1], clause.id];
    } else {
      next = [...compareIds, clause.id];
    }
    setCompareIds(next);
    if (next.length === 2) setActiveTab('compare');
    else if (activeTab === 'compare') setActiveTab('analysis');
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareIds([]);
    setActiveTab('analysis');
  };

  // Arrow keys move the selection through the filtered clause list.
  // Skipped while typing in an input or textarea.
  useKeyboard('ArrowDown', () => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (filteredClauses.length === 0) return;
    const idx = filteredClauses.findIndex((c) => c.id === selectedClause?.id);
    setSelectedClause(filteredClauses[Math.min(idx + 1, filteredClauses.length - 1)]);
  });
  useKeyboard('ArrowUp', () => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (filteredClauses.length === 0) return;
    const idx = filteredClauses.findIndex((c) => c.id === selectedClause?.id);
    setSelectedClause(filteredClauses[Math.max(idx - 1, 0)]);
  });

  // "/" focuses the clause search, Escape clears it — both skipped while
  // typing anywhere else, so they never steal keystrokes from an input.
  const searchInputRef = useRef<HTMLInputElement>(null);
  useKeyboard('/', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    searchInputRef.current?.focus();
  });
  useKeyboard('Escape', () => {
    // Only when the search box itself (or nothing) has focus — Escape
    // while typing in chat must not wipe the clause search.
    if (!clauseQuery) return;
    const el = document.activeElement;
    if (el === searchInputRef.current || el === document.body) setClauseQuery('');
  });

  /** Download a Markdown risk report built only from this contract's own data. */
  const handleExportReport = () => {
    if (!activeContract) return;
    const markdown = buildReportMarkdown(activeContract, activeClauses);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(activeContract);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setExported(true);
    if (exportedTimer.current) clearTimeout(exportedTimer.current);
    exportedTimer.current = setTimeout(() => setExported(false), 2500);
  };

  // Only show the copied checkmark when the copy actually worked; a
  // failed clipboard write (non-secure context, denied permission) used
  // to show it anyway because the promise was fire-and-forget.
  const handleCopy = async (id: string, text: string) => {
    if (!(await copyToClipboard(text))) return;
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Scope each load to this route effect. Late results from a prior contract
  // must not overwrite the active document or selected clause.
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    const ownerCurrent = workspaceGuard();
    const currentOwner = () => !disposed && ownerCurrent();
    setSelectedClause(null);
    setClausesLoading(true);
    setLoadError(null);
    setChatInput('');
    setIsChatGenerating(false);
    setWsConnected(false);
    setCopiedId(null);
    setActiveTab('analysis');
    setClauseQuery('');
    setRiskFilter('all');
    setCompareMode(false);
    setCompareIds([]);
    const current = useContractStore.getState().contracts.find(c => c.id === id);
    setActiveContract(current || null);
    setActiveClauses([]);
    const load = async () => {
      try {
        if (!current) {
          const response = await authenticatedFetch(`${API_URL}/contracts`);
          if (!currentOwner()) return;
          if (!response.ok) throw new Error('Contract list unavailable.');
          const data = await response.json();
          if (!currentOwner()) return;
          const found = data.find((contract: any) => contract.id === id);
          if (!found) { navigate('/dashboard'); return; }
          setContracts(data);
          setActiveContract(found);
        }
        const response = await authenticatedFetch(`${API_URL}/contracts/${id}/clauses`);
        if (!currentOwner()) return;
        if (!response.ok) throw new Error('Contract clauses unavailable.');
        const clauses = await response.json();
        if (!currentOwner()) return;
        setActiveClauses(clauses);
        setSelectedClause(clauses[0] || null);
        setClausesLoading(false);
      } catch {
        if (currentOwner()) {
          setActiveClauses([]);
          setSelectedClause(null);
          setClausesLoading(false);
          setLoadError('Contract details could not be loaded. Return to the dashboard or reload to try again.');
        }
      }
    };
    void load();
    return () => { disposed = true; };
  }, [id, user?.id, navigate, setActiveContract, setActiveClauses, setContracts]);

  // 2. Configure WebSocket connection for real-time document chat
  useEffect(() => {
    const ownerCurrent = workspaceGuard();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws || !ownerCurrent()) return;
      console.log('// WS: Connected to RAG chat drawer');
      setWsConnected(true);
      if (id) {
        void sendAuthenticated(ws, {
          type: 'subscribe',
          contractId: id
        }).catch(() => ws.close(1008, 'Authentication required'));
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws || !ownerCurrent()) return;
      setWsConnected(false);
      failPendingChat.current?.();
    };

    ws.onerror = () => {
      console.error('WebSocket chat connection failed.');
      if (wsRef.current === ws && ownerCurrent()) failPendingChat.current?.();
    };

    return () => {
      failPendingChat.current?.();
      wsRef.current = null;
      ws.close();
    };
  }, [id, user?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatGenerating || !wsRef.current || wsRef.current.readyState !== 1) return;

    const userMsgText = chatInput.trim();
    setChatInput('');
    setIsChatGenerating(true);

    // Append user message to list
    const userMsg: ChatMessage = {
      id: `msg-user-${Math.random().toString(36).substring(2, 9)}`,
      sessionId: 'session-001',
      sender: 'user',
      message: userMsgText,
      createdAt: new Date().toISOString()
    };
    
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    // Pre-create assistant empty streaming message
    const assistantMsgId = `msg-assistant-${Math.random().toString(36).substring(2, 9)}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sessionId: 'session-001',
      sender: 'assistant',
      message: '',
      createdAt: new Date().toISOString()
    };

    const finalMessagesWithAssistant = [...updatedMessages, initialAssistantMsg];
    setChatMessages(finalMessagesWithAssistant);

    const ownerCurrent = workspaceGuard();
    const socket = wsRef.current;
    let accumulatedResponse = '';
    let finished = false;
    const fail = () => {
      if (finished) return;
      if (!ownerCurrent()) { finished = true; failPendingChat.current = null; return; }
      finished = true;
      failPendingChat.current = null;
      setIsChatGenerating(false);
      setChatMessages(interruptChat(useContractStore.getState().chatMessages, assistantMsgId));
    };
    failPendingChat.current = fail;

    // Install the response handler before sending. Read current store state so
    // an error never discards the user's latest question or unrelated updates.
    socket.onmessage = (event) => {
      if (finished || wsRef.current !== socket || !ownerCurrent()) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch { fail(); return; }
      if (payload.type === 'token' && typeof payload.token === 'string') {
        accumulatedResponse += payload.token;
        setChatMessages(useContractStore.getState().chatMessages.map(message =>
          message.id === assistantMsgId ? { ...message, message: accumulatedResponse } : message));
      } else if (payload.type === 'chat_end') {
        if (!accumulatedResponse) { fail(); return; }
        finished = true;
        failPendingChat.current = null;
        setIsChatGenerating(false);
      } else if (payload.type === 'error') {
        fail();
      }
    };
    void sendAuthenticated(socket, {
      type: 'chat', contractId: id, messages: chatHistory(finalMessagesWithAssistant)
    }).catch(fail);

  };

  const getRiskBorder = (level: string) => {
    switch (level) {
      case 'critical': return 'border-l-4 border-risk-critical';
      case 'high': return 'border-l-4 border-risk-high';
      case 'medium': return 'border-l-4 border-risk-medium';
      default: return 'border-l-4 border-risk-low';
    }
  };

  const getRiskTone = (level: string): BadgeTone => {
    switch (level) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      default: return 'low';
    }
  };

  /** General next steps for a risk level — guidance, not legal advice,
   *  and not specific to any one clause's wording. */
  const NEXT_STEPS: Record<RiskLevel, string> = {
    critical:
      'Do not sign as written. Get a lawyer to review this clause and negotiate the suggested revision before proceeding.',
    high:
      'Negotiate this clause before signing. Use the suggested revision as a starting point and get any change in writing.',
    medium:
      'Ask the other party to clarify this clause in writing so its meaning is not left open to dispute.',
    low: 'No action needed. This clause looks standard — keep it on file with the rest of the contract.',
  };

  return (
    <div className="h-screen h-[100dvh] bg-background-base flex flex-col overflow-hidden">
      <Navbar currentView="analyzer" setView={(v) => navigate(v === 'dashboard' ? '/dashboard' : `/contract/${id}`)} onLogout={handleLogout} />
      
      {/* Sub Header */}
      <div className="bg-background-panel border-b border-overlay/5 px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            aria-label="Back to dashboard"
            className="p-1.5 rounded hover:bg-overlay/5 border border-transparent hover:border-overlay/10 text-text-secondary hover:text-text-primary precise-transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-mono font-bold text-text-primary uppercase tracking-wide break-all">
              {activeContract?.name || 'ANALYZER MODE'}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={handleExportReport}
            disabled={!activeContract || activeClauses.length === 0}
            aria-label="Download a Markdown risk report for this contract"
            title="Download a Markdown risk report for this contract"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 hover:bg-accent-cyan/20 text-accent-cyan text-[11px] font-mono font-bold uppercase tracking-wider precise-transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exported ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {exported ? 'Downloaded' : 'Export report'}
          </button>
          <Badge tone="critical">
            Critical: {activeClauses.filter(c => c.riskLevel === 'critical').length}
          </Badge>
          <Badge tone="high">
            High: {activeClauses.filter(c => c.riskLevel === 'high').length}
          </Badge>
          <Badge tone="medium">
            Med: {activeClauses.filter(c => c.riskLevel === 'medium').length}
          </Badge>
        </div>
      </div>

      {/* Side by Side */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side */}
        <div className="w-full md:w-1/2 min-w-0 h-[32%] md:h-auto shrink-0 border-b md:border-r border-overlay/5 flex flex-col bg-background-base overflow-hidden">
          <div className="border-b border-overlay/5 p-4 flex items-center gap-2 bg-overlay/1">
            <FileText className="w-4 h-4 text-accent-cyan" />
            <span className="text-xs font-mono font-bold text-text-secondary uppercase">
              Contract Clauses
            </span>
            <span className="ml-auto text-[10px] font-mono text-text-muted">
              {filteredClauses.length} of {activeClauses.length}
            </span>
          </div>

          {/* Clause search, risk filter and compare toggle */}
          <div className="border-b border-overlay/5 p-3 space-y-2 bg-background-panel/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={clauseQuery}
                onChange={(e) => setClauseQuery(e.target.value)}
                placeholder="Search clauses by number, title or text…"
                aria-label="Search clauses"
                className="w-full bg-background-base border border-overlay/10 outline-none rounded-lg py-2 pl-9 pr-8 text-xs font-sans text-text-primary placeholder:text-text-muted/60 focus:border-accent-cyan/50 precise-transition"
              />
              {clauseQuery && (
                <button
                  onClick={() => setClauseQuery('')}
                  aria-label="Clear clause search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-muted hover:text-text-primary precise-transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter clauses by risk level">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setRiskFilter(level)}
                  aria-pressed={riskFilter === level}
                  className={cn(
                    'px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider precise-transition',
                    riskFilter === level
                      ? 'bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan'
                      : 'border-overlay/10 text-text-muted hover:text-text-secondary hover:border-overlay/20',
                  )}
                >
                  {level === 'all' ? `All (${activeClauses.length})` : `${level} (${riskCounts[level]})`}
                </button>
              ))}
              <button
                onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}
                aria-pressed={compareMode}
                title="Pick two clauses to compare side by side"
                className={cn(
                  'ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider precise-transition',
                  compareMode
                    ? 'bg-accent-cyan/15 border-accent-cyan/40 text-accent-cyan'
                    : 'border-overlay/10 text-text-muted hover:text-text-secondary hover:border-overlay/20',
                )}
              >
                <GitCompare className="w-3 h-3" />
                Compare{compareMode ? ` (${compareIds.length}/2)` : ''}
              </button>
            </div>
            {compareMode && (
              <p className="text-[10px] font-mono text-text-muted">
                {compareIds.length < 2
                  ? 'Pick two clauses to compare them side by side.'
                  : 'Two clauses picked — open the Compare tab on the right.'}
              </p>
            )}
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] font-mono text-text-muted">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span>
              <span className="mr-2">move</span>
              <span className="kbd">/</span>
              <span className="mr-2">search</span>
              <span className="kbd">Esc</span>
              <span>clear search</span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {clausesLoading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading contract clauses">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2 rounded border border-overlay/5 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                ))}
              </div>
            ) : activeClauses.length === 0 ? (
              <div className="p-12 text-center text-text-muted font-mono text-xs">
                {loadError || (activeContract?.status === 'processing' ? 'Analysis is still processing. Return to the dashboard for status updates.' : activeContract?.status === 'failed' ? 'Analysis failed. No completed clause review is available.' : 'No clause results are available for this contract.')}
              </div>
            ) : filteredClauses.length === 0 ? (
              <EmptyState
                icon={<Search className="w-6 h-6 text-text-muted/50" />}
                title="No Clauses Match"
                description="Try a different search term or clear the risk filter to see more clauses."
              />
            ) : (
              filteredClauses.map((clause) => {
                const inCompare = compareIds.includes(clause.id);
                return (
                <Card
                  key={clause.id}
                  onClick={() => (compareMode ? toggleCompare(clause) : setSelectedClause(clause))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (compareMode) toggleCompare(clause);
                      else setSelectedClause(clause);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={compareMode ? inCompare : selectedClause?.id === clause.id}
                  aria-label={compareMode
                    ? `${inCompare ? 'Remove' : 'Add'} clause ${clause.number ? `${clause.number}: ` : ''}${clause.title} ${inCompare ? 'from' : 'to'} comparison`
                    : `Select clause ${clause.number ? `${clause.number}: ` : ''}${clause.title}`}
                  className={cn(
                    'p-4 precise-transition cursor-pointer',
                    getRiskBorder(clause.riskLevel),
                    (compareMode ? inCompare : selectedClause?.id === clause.id)
                      ? 'border-accent-cyan bg-accent-cyan/5 shadow-card'
                      : 'border-overlay/5 hover:border-overlay/10 hover:bg-overlay/2',
                  )}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <span className="font-mono text-xs font-bold text-text-primary">
                      {compareMode && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            'inline-flex items-center justify-center w-4 h-4 mr-2 rounded border align-middle',
                            inCompare
                              ? 'bg-accent-cyan border-accent-cyan text-background-base'
                              : 'border-overlay/20 text-transparent',
                          )}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                      {clause.number ? `[${clause.number}]` : ''} {clause.title}
                    </span>
                    <Badge tone={getRiskTone(clause.riskLevel)}>{clause.riskLevel}</Badge>
                  </div>
                  <p className="text-xs text-text-secondary font-sans line-clamp-3 leading-relaxed">
                    {clause.text}
                  </p>
                </Card>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side — Tab Layout */}
        <div className="w-full md:w-1/2 min-w-0 min-h-0 flex-1 flex flex-col bg-background-panel/50 overflow-hidden">
          {selectedClause || compareClauses.length === 2 ? (
            <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">

              {/* Tab Bar */}
              <div className="border-b border-overlay/5 flex flex-wrap items-center bg-background-panel/80 px-2 sm:px-4 gap-1 pt-2 flex-shrink-0">
                {selectedClause && (
                <button
                  onClick={() => setActiveTab('analysis')}
                  aria-pressed={activeTab === 'analysis'}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-t border-b-2 precise-transition flex items-center gap-1.5 ${
                    activeTab === 'analysis'
                      ? 'text-text-primary border-accent-cyan bg-accent-cyan/5'
                      : 'text-text-muted border-transparent hover:text-text-secondary hover:border-overlay/20'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  Analysis
                </button>
                )}
                {selectedClause && (
                <button
                  onClick={() => setActiveTab('chat')}
                  aria-pressed={activeTab === 'chat'}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-t border-b-2 precise-transition flex items-center gap-1.5 ${
                    activeTab === 'chat'
                      ? 'text-text-primary border-accent-cyan bg-accent-cyan/5'
                      : 'text-text-muted border-transparent hover:text-text-secondary hover:border-overlay/20'
                  }`}
                >
                  <MessageSquareCode className="w-3 h-3" />
                  AI Chat
                  {chatMessages.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan font-bold">
                      {chatMessages.length}
                    </span>
                  )}
                </button>
                )}
                {compareClauses.length === 2 && (
                  <button
                    onClick={() => setActiveTab('compare')}
                    aria-pressed={activeTab === 'compare'}
                    className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-t border-b-2 precise-transition flex items-center gap-1.5 ${
                      activeTab === 'compare'
                        ? 'text-text-primary border-accent-cyan bg-accent-cyan/5'
                        : 'text-text-muted border-transparent hover:text-text-secondary hover:border-overlay/20'
                    }`}
                  >
                    <GitCompare className="w-3 h-3" />
                    Compare
                  </button>
                )}

                {/* Right-side status badge in tab bar */}
                <div className="ml-auto flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                    wsConnected
                      ? 'text-risk-low bg-risk-low/5 border-risk-low/20'
                      : 'text-risk-medium bg-risk-medium/5 border-risk-medium/20'
                  }`}>
                    {wsConnected ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    {wsConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>

              {/* Analysis Tab */}
              {activeTab === 'analysis' && selectedClause && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 break-words">
                  <div className="flex flex-wrap gap-3 justify-between items-start border-b border-overlay/5 pb-4">
                    <div>
                      <span className="font-mono text-xs text-accent-cyan uppercase tracking-widest block mb-1">
                        Clause Analysis
                      </span>
                      <h3 className="text-lg font-mono font-bold text-text-primary">
                        {selectedClause.number ? `${selectedClause.number}: ` : ''}{selectedClause.title}
                      </h3>
                    </div>
                    <Badge tone={getRiskTone(selectedClause.riskLevel)} className="px-3 py-1.5 text-xs">
                      {selectedClause.riskLevel} Risk
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block">
                      Original Clause
                    </span>
                    <div className="p-4 bg-background-base border border-overlay/5 rounded-lg font-sans text-sm text-text-secondary leading-relaxed select-text">
                      {selectedClause.text}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-risk-high" />
                      <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest">
                        Risk Explanation
                      </span>
                    </div>
                    <div className="p-4 bg-risk-critical/5 border border-risk-critical/10 rounded-lg font-sans text-sm text-text-secondary leading-relaxed">
                      {selectedClause.riskExplanation}
                    </div>
                  </div>

                  {selectedClause.suggestedRedline && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileEdit className="w-4 h-4 text-risk-low" />
                        <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest">
                          Suggested Revision
                        </span>
                        <button
                          onClick={() => void handleCopy(`redline-${selectedClause.id}`, selectedClause.suggestedRedline!)}
                          aria-label="Copy suggested revision"
                          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border border-overlay/10 text-text-muted hover:text-text-primary hover:border-overlay/20 text-[10px] font-mono font-bold uppercase tracking-wider precise-transition"
                        >
                          {copiedId === `redline-${selectedClause.id}` ? <CheckCheck className="w-3 h-3 text-risk-low" /> : <Copy className="w-3 h-3" />}
                          {copiedId === `redline-${selectedClause.id}` ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-4 bg-risk-low/5 border border-risk-low/10 rounded-lg font-sans text-sm text-text-secondary leading-relaxed">
                        <div className="text-xs font-mono text-text-muted mb-2">PROPOSED AMENDMENT:</div>
                        <div className="text-risk-low border-l-2 border-risk-low/30 pl-3 italic">
                          {selectedClause.suggestedRedline}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-accent-cyan" />
                      <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest">
                        What To Do Next
                      </span>
                    </div>
                    <div className="p-4 bg-accent-cyan/5 border border-accent-cyan/10 rounded-lg font-sans text-sm text-text-secondary leading-relaxed">
                      {NEXT_STEPS[selectedClause.riskLevel]}
                      <span className="block mt-2 text-[10px] font-mono text-text-muted">
                        General guidance for this risk level — not legal advice.
                      </span>
                    </div>
                  </div>

                  {/* Quick Chat CTA */}
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="w-full mt-2 py-3 rounded-lg border border-accent-cyan/20 bg-accent-cyan/3 hover:bg-accent-cyan/8 hover:border-accent-cyan/40 text-accent-cyan text-xs font-mono font-bold uppercase tracking-wider precise-transition flex items-center justify-center gap-2"
                  >
                    <MessageSquareCode className="w-3.5 h-3.5" />
                    Ask AI about this clause →
                  </button>
                </div>
              )}

              {/* Compare Tab — two clauses side by side */}
              {activeTab === 'compare' && compareClauses.length === 2 && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5 break-words">
                  <div className="flex flex-wrap gap-3 justify-between items-start border-b border-overlay/5 pb-4">
                    <div>
                      <span className="font-mono text-xs text-accent-cyan uppercase tracking-widest block mb-1">
                        Clause Comparison
                      </span>
                      <h3 className="text-lg font-mono font-bold text-text-primary">
                        {compareClauses[0].number || compareClauses[0].title} vs{' '}
                        {compareClauses[1].number || compareClauses[1].title}
                      </h3>
                    </div>
                    <button
                      onClick={exitCompareMode}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-overlay/10 hover:border-overlay/20 text-text-muted hover:text-text-primary text-[11px] font-mono font-bold uppercase tracking-wider precise-transition"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear
                    </button>
                  </div>
                  {compareSummary && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-cyan/15 bg-accent-cyan/5 px-4 py-3">
                      <Badge tone={getRiskTone(compareClauses[0].riskLevel)}>{compareClauses[0].riskLevel}</Badge>
                      <span className="text-xs font-mono text-text-muted">vs</span>
                      <Badge tone={getRiskTone(compareClauses[1].riskLevel)}>{compareClauses[1].riskLevel}</Badge>
                      <p className="text-xs font-sans text-text-secondary leading-relaxed">{compareSummary}</p>
                    </div>
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {compareClauses.map((clause) => (
                      <article key={clause.id} className={cn('rounded-lg border border-overlay/10 p-4 space-y-3', getRiskBorder(clause.riskLevel))}>
                        <div className="flex justify-between items-start gap-3">
                          <h4 className="font-mono text-xs font-bold text-text-primary">
                            {clause.number ? `${clause.number}: ` : ''}{clause.title}
                          </h4>
                          <Badge tone={getRiskTone(clause.riskLevel)}>{clause.riskLevel}</Badge>
                        </div>
                        <p className="text-xs text-text-secondary font-sans leading-relaxed">{clause.text}</p>
                        <div>
                          <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block mb-1">
                            Risk Explanation
                          </span>
                          <p className="text-xs text-text-secondary font-sans leading-relaxed">{clause.riskExplanation}</p>
                        </div>
                        {clause.suggestedRedline && (
                          <div>
                            <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block mb-1">
                              Suggested Revision
                            </span>
                            <p className="text-xs text-risk-low font-sans leading-relaxed border-l-2 border-risk-low/30 pl-3 italic">
                              {clause.suggestedRedline}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-text-secondary font-sans leading-relaxed">
                          <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block mb-1">
                            What To Do Next
                          </span>
                          {NEXT_STEPS[clause.riskLevel]}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Tab — full height */}
              {activeTab === 'chat' && selectedClause && (
                <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
                  {/* Chat context pill */}
                  <div className="px-4 py-2 flex-shrink-0 border-b border-overlay/5 bg-background-base/20">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                      <span className="text-accent-cyan">▸</span>
                      Context:
                      <span className="text-text-secondary font-bold truncate">
                        {selectedClause.number ? `${selectedClause.number} · ` : ''}{selectedClause.title}
                      </span>
                      {isChatGenerating && (
                        <span className="ml-auto flex items-center gap-1 text-risk-medium">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'0ms'}} />
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'150ms'}} />
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'300ms'}} />
                          Thinking...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Messages scroll area — takes all available height */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 break-words">
                    {/* Welcome bubble */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-accent-cyan" />
                      </div>
                      <div className="bg-overlay/3 border border-overlay/8 px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm font-sans text-text-secondary leading-relaxed flex-1 max-w-[90%]">
                        <span className="block text-[10px] font-mono text-accent-cyan mb-1 uppercase tracking-wider">AuditMind</span>
                        Ask me anything about this contract — clause obligations, risk implications, breach scenarios, or deadline triggers.
                      </div>
                    </div>

                    {chatMessages.map((msg) => {
                      const isLocalSearch = msg.message.startsWith(INCOMPLETE_ANSWER);
                      const isUser = msg.sender === 'user';
                      return (
                        <div key={msg.id} className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                          {!isUser && (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${
                              isLocalSearch
                                ? 'bg-risk-medium/15 border-risk-medium/30'
                                : 'bg-accent-cyan/10 border-accent-cyan/20'
                            }`}>
                              <Bot className={`w-3.5 h-3.5 ${isLocalSearch ? 'text-risk-medium' : 'text-accent-cyan'}`} />
                            </div>
                          )}
                          <div className={`relative group max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm font-sans leading-relaxed border ${
                            isUser
                              ? 'bg-accent-cyan/10 border-accent-cyan/20 rounded-br-sm text-text-primary'
                              : isLocalSearch
                              ? 'bg-amber-500/5 border-amber-500/20 rounded-bl-sm text-amber-700 dark:text-amber-200'
                              : 'bg-overlay/3 border-overlay/8 rounded-bl-sm text-text-secondary'
                          }`}>
                            {!isUser && (
                              <span className={`block text-[9px] font-mono mb-1.5 uppercase tracking-wider ${
                                isLocalSearch ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-text-muted'
                              }`}>
                                {isLocalSearch ? 'Incomplete response' : 'AuditMind'}
                              </span>
                            )}
                            <div className="whitespace-pre-line select-text break-words">{msg.message}</div>
                            {/* Hover copy button */}
                            <button
                              onClick={() => handleCopy(msg.id, msg.message)}
                              aria-label="Copy message"
                              className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-background-panel border border-overlay/10 p-1 rounded-md text-text-muted hover:text-text-primary precise-transition shadow-lg"
                              title="Copy"
                            >
                              {copiedId === msg.id
                                ? <CheckCheck className="w-3 h-3 text-risk-low" />
                                : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Typing indicator — only show when empty placeholder message is streaming */}
                    {isChatGenerating && chatMessages[chatMessages.length - 1]?.message === '' && (
                      <div className="flex items-end gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-accent-cyan" />
                        </div>
                        <div className="bg-overlay/3 border border-overlay/8 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'0ms'}} />
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'160ms'}} />
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'320ms'}} />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="flex-shrink-0 border-t border-overlay/5 bg-background-panel/60 p-4">
                    <form onSubmit={handleSendChat} className="flex gap-2.5 items-center">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={isChatGenerating ? 'AuditMind is thinking...' : "Ask a question about this contract..."}
                        aria-label="Ask a question about this contract"
                        disabled={isChatGenerating}
                        className="min-w-0 flex-1 bg-background-base border border-overlay/10 outline-none rounded-xl py-3 px-4 text-sm font-sans text-text-primary placeholder:text-text-muted/50 focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 precise-transition disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isChatGenerating || !wsConnected}
                        aria-label="Send message"
                        className="w-10 h-10 bg-accent-cyan/15 hover:bg-accent-cyan/25 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan rounded-xl precise-transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0"
                        title="Send"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                    <p className="text-[10px] text-text-muted/40 font-mono mt-2 text-center">
                      {wsConnected ? 'Connected · AI output needs legal review' : 'Offline · Reload to reconnect'}
                    </p>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <EmptyState
              icon={<FileText className="w-6 h-6 text-text-muted/50" />}
              title="No Clause Selected"
              description="Click any clause on the left panel to view its risk analysis, suggested revisions, and ask AI questions."
              className="flex-grow"
            />
          )}
        </div>
      </div>
    </div>
  );
}
