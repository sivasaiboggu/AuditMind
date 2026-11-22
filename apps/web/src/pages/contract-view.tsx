import { authenticatedFetch, sendAuthenticated } from '../lib/api';
import { buildReportMarkdown, countByRisk, reportFileName } from '../lib/report';
import { splitByMatchedTerms, formatMatchedTerms } from '../lib/evidence';
import { workspaceGuard } from '../lib/workspace-guard';
import { chatHistory, interruptChat, INCOMPLETE_ANSWER } from '../lib/chat-stream';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { useKeyboard } from '../hooks/useKeyboard';
import { Navbar } from '../components/Navbar';
import { Badge, Button, EmptyState, Skeleton } from '../components/ui';
import { copyToClipboard } from '../lib/utils';
import { ArrowLeft, ArrowRight, Send, FileText, Copy, Check, Download, Search, GitCompare, MessageSquare } from 'lucide-react';
import type { Clause, ChatMessage, RiskLevel } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

const riskLevels = ['critical', 'high', 'medium', 'low'] as const;
const riskRank = { low: 1, medium: 2, high: 3, critical: 4 };
const nextSteps: Record<RiskLevel, string> = {
  critical: 'Have a lawyer review this clause before signing. Discuss the exposure and any proposed revision.',
  high: 'Discuss the clause with the other party and record any agreed changes in writing.',
  medium: 'Ask the other party to clarify the obligation in writing.',
  low: 'Keep the clause with the rest of the agreement and check it against your requirements.',
};

function SourceText({ clause }: { clause: Clause }) {
  const terms = clause.matchedTerms ?? [];
  return (
    <>
      <blockquote className="margin-note reading text-text-secondary">
        {splitByMatchedTerms(clause.text, terms).map((segment, index) => segment.matched
          ? <strong key={index} className="font-semibold text-text-primary underline decoration-accent-brand decoration-2 underline-offset-4">{segment.text}</strong>
          : segment.text)}
      </blockquote>
      {terms.length > 0 && <p className="mt-3 text-sm text-text-muted">Matched words · <span className="text-text-primary">{formatMatchedTerms(terms)}</span></p>}
    </>
  );
}

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
  const clauseIndex = useRef<HTMLElement>(null);
  const [selectedClause, setSelectedClause] = useState<Clause | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat' | 'compare'>('analysis');
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  // Bumped by the Reconnect button: re-runs the socket effect without a
  // full page reload when the chat connection drops.
  const [wsEpoch, setWsEpoch] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
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
  const compareSummary = useMemo(() => {
    if (compareClauses.length !== 2) return null;
    const [a, b] = compareClauses;
    const rankA = riskRank[a.riskLevel];
    const rankB = riskRank[b.riskLevel];
    const label = (c: Clause) => c.number || c.title;
    return rankA === rankB
      ? 'Both clauses have the same risk level.'
      : `${label(rankA > rankB ? a : b)} has the higher risk level.`;
  }, [compareClauses]);

  // Same guarded counter as the report export: an unexpected risk level
  // from the API must be ignored, not counted (see countByRisk).
  const riskCounts = useMemo(() => countByRisk(activeClauses), [activeClauses]);

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

  const searchInputRef = useRef<HTMLInputElement>(null);

  function moveClause(event: KeyboardEvent, offset: number) {
    const target = document.activeElement;
    if (!target || !clauseIndex.current?.contains(target) || !target.matches('button[data-clause]') || !filteredClauses.length) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const index = filteredClauses.findIndex((clause) => clause.id === target.getAttribute('data-clause'));
    const next = Math.max(0, Math.min(index + offset, filteredClauses.length - 1));
    const nextClause = filteredClauses[next];
    if (!compareMode) setSelectedClause(nextClause);
    clauseIndex.current.querySelectorAll<HTMLButtonElement>('button[data-clause]')[next]?.focus();
  }

  useKeyboard('ArrowDown', (event) => moveClause(event, 1));
  useKeyboard('ArrowUp', (event) => moveClause(event, -1));
  useKeyboard('/', (event) => {
    const target = document.activeElement;
    if (!target || !clauseIndex.current?.contains(target) || target.matches('input, textarea, select') || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    searchInputRef.current?.focus();
  });
  useKeyboard('Escape', () => {
    if (document.activeElement === searchInputRef.current) setClauseQuery('');
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
    setWsConnected(false);
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
  }, [id, user?.id, wsEpoch]);

  useEffect(() => {
    const messages = chatLogRef.current;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, [chatMessages, activeTab]);

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

  const tab = compareClauses.length < 2 && activeTab === 'compare' ? 'analysis' : activeTab;

  return (
    <div className="min-h-screen">
      <Navbar onLogout={handleLogout} />
      <main id="main-content" tabIndex={-1} className="frame wide-frame review-main">
        <header className="workspace-title review-title">
          <div className="min-w-0">
            <Link to="/dashboard" className="mb-3 inline-flex min-h-8 items-center gap-2 text-sm text-text-secondary hover:text-accent-brand">
              <ArrowLeft size={16} aria-hidden="true" /> All contracts
            </Link>
            <h1 className="page-title break-words">{activeContract?.name || 'Contract review'}</h1>
            {activeClauses.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1" aria-label="Clause counts by risk level">
                <li className="text-sm text-text-secondary">{activeClauses.length} clauses</li>
                {riskLevels.map((level) => <li key={level}><Badge tone={level} className="capitalize">{riskCounts[level]} {level}</Badge></li>)}
              </ul>
            )}
          </div>
          <Button variant="outline" onClick={handleExportReport} disabled={!activeContract || !activeClauses.length}
            title="Download a Markdown risk report for this contract">
            {exported ? <Check size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            <span aria-live="polite">{exported ? 'Report downloaded' : 'Export report'}</span>
          </Button>
        </header>

        <div className="review-layout sheet">
          <section ref={clauseIndex} className="clause-index" aria-labelledby="index-title">
            <div className="ledger-header">
              <h2 id="index-title" className="text-xl font-semibold tracking-tight">Clauses</h2>
              <p className="eyebrow tnum" role="status">{filteredClauses.length} of {activeClauses.length}</p>
            </div>
            <div className="grid gap-3 border-b border-rule p-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input ref={searchInputRef} type="search" value={clauseQuery} onChange={(event) => setClauseQuery(event.target.value)}
                  placeholder="Search clauses" aria-label="Search clauses" aria-keyshortcuts="/" className="field pl-9" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="field min-w-0 flex-1 text-sm" aria-label="Filter clauses by risk level" value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value as 'all' | RiskLevel)}>
                  <option value="all">All risk levels</option>
                  {riskLevels.map((level) => <option key={level} value={level}>{level[0].toUpperCase()}{level.slice(1)} ({riskCounts[level]})</option>)}
                </select>
                <Button variant={compareMode ? 'primary' : 'outline'} size="sm" aria-pressed={compareMode}
                  onClick={() => (compareMode ? exitCompareMode() : setCompareMode(true))}>
                  <GitCompare size={16} aria-hidden="true" /> Compare{compareMode ? ` (${compareIds.length}/2)` : ''}
                </Button>
              </div>
              {compareMode && (
                <p className="text-sm text-text-secondary" role="status">
                  {compareIds.length === 2 ? 'Two clauses selected.' : 'Select two clauses to compare.'}
                </p>
              )}
            </div>

            <div className="clause-index-scroll">
              {clausesLoading ? (
                <div className="space-y-3 p-4" aria-busy="true" role="status">
                  <p className="text-text-secondary">Loading clauses…</p>
                  {[0, 1, 2].map((index) => <Skeleton key={index} className="h-12 w-full" />)}
                </div>
              ) : loadError ? (
                <EmptyState title="Could not load the review" description={loadError}
                  action={<Button variant="outline" onClick={() => window.location.reload()}>Reload review</Button>} />
              ) : activeClauses.length === 0 ? (
                <EmptyState title={activeContract?.status === 'processing' ? 'Analysis in progress' : 'No clauses available'}
                  description={activeContract?.status === 'processing' ? 'Check the contract list for updates.' : activeContract?.status === 'failed' ? 'This analysis failed. Open the contract list for details.' : 'This contract has no clause results.'} />
              ) : filteredClauses.length === 0 ? (
                <EmptyState title="No matching clauses" description="Change the search or risk filter."
                  action={<Button variant="outline" onClick={() => { setClauseQuery(''); setRiskFilter('all'); }}>Clear filters</Button>} />
              ) : (
                <ul>
                  {filteredClauses.map((clause) => {
                    const pressed = compareMode ? compareIds.includes(clause.id) : selectedClause?.id === clause.id;
                    return (
                      <li key={clause.id}>
                        <button type="button" data-clause={clause.id} aria-pressed={pressed}
                          className="clause-row" onClick={() => compareMode ? toggleCompare(clause) : setSelectedClause(clause)}>
                          <span className="eyebrow">
                            <span className="sr-only">{compareMode ? (pressed ? 'Remove from comparison: ' : 'Add to comparison: ') : 'Select clause: '}</span>
                            {clause.number || 'Clause'}
                          </span>
                          <Badge tone={clause.riskLevel} className="justify-self-end capitalize">{clause.riskLevel}</Badge>
                          <span className="clause-row-name">{compareMode && pressed && <Check size={14} aria-hidden="true" />}{clause.title}</span>
                          {typeof clause.riskScore === 'number' && <span className="justify-self-end font-mono text-xs text-text-muted tnum">{clause.riskScore}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="clause-keys text-xs text-text-muted">
              <kbd className="kbd">Up</kbd> <kbd className="kbd">Down</kbd> move
              <span className="mx-2" aria-hidden="true">·</span><kbd className="kbd">/</kbd> search
              <span className="mx-2" aria-hidden="true">·</span><kbd className="kbd">Esc</kbd> clear search
            </p>
            {(selectedClause || compareClauses.length === 2) && <a href="#clause-reading" className="review-jump text-link text-sm">Go to {tab === 'compare' ? 'comparison' : 'clause detail'} <ArrowRight size={15} aria-hidden="true" /></a>}
          </section>

          <section className="review-pane" id="clause-reading" tabIndex={-1} aria-label="Clause review">
            {selectedClause || compareClauses.length === 2 ? (
              <>
                <div className="review-tabs" role="group" aria-label="Review view">
                  {selectedClause && <button type="button" aria-pressed={tab === 'analysis'} onClick={() => setActiveTab('analysis')}><FileText size={16} aria-hidden="true" /> Analysis</button>}
                  {selectedClause && <button type="button" aria-pressed={tab === 'chat'} onClick={() => setActiveTab('chat')}><MessageSquare size={16} aria-hidden="true" /> Chat{chatMessages.length > 0 && <span className="font-mono text-xs text-text-muted">{chatMessages.length}</span>}</button>}
                  {compareClauses.length === 2 && <button type="button" aria-pressed={tab === 'compare'} onClick={() => setActiveTab('compare')}><GitCompare size={16} aria-hidden="true" /> Comparison</button>}
                </div>

                {tab === 'analysis' && selectedClause && (
                  <article className="review-content">
                    <header className="review-reading-title">
                      <div className="min-w-0">
                        <p className="eyebrow">{selectedClause.number || 'Clause'}</p>
                        <h2 className="section-title mt-2 break-words">{selectedClause.title}</h2>
                      </div>
                      <div className="review-score">
                        <Badge tone={selectedClause.riskLevel} className="capitalize">{selectedClause.riskLevel} risk</Badge>
                        {typeof selectedClause.riskScore === 'number' && <p className="text-sm text-text-secondary tnum"><strong className="text-xl text-text-primary">{selectedClause.riskScore}</strong> / 100</p>}
                      </div>
                    </header>
                    <section className="review-reading-section source-section">
                      <h3>Original clause</h3>
                      <SourceText clause={selectedClause} />
                    </section>
                    <section className="review-reading-section">
                      <h3>Why it was flagged</h3>
                      <p className="reading text-text-secondary">{selectedClause.riskExplanation || 'No explanation is available for this finding.'}</p>
                    </section>
                    {selectedClause.suggestedRedline && (
                      <section className="review-reading-section">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3>Suggested revision</h3>
                          <Button variant="outline" size="sm" onClick={() => void handleCopy(`redline-${selectedClause.id}`, selectedClause.suggestedRedline!)} aria-label="Copy suggested revision">
                            {copiedId === `redline-${selectedClause.id}` ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                            <span aria-live="polite">{copiedId === `redline-${selectedClause.id}` ? 'Copied' : 'Copy'}</span>
                          </Button>
                        </div>
                        <p className="reading text-text-secondary">{selectedClause.suggestedRedline}</p>
                      </section>
                    )}
                    <section className="review-reading-section">
                      <h3>Next step</h3>
                      <p className="reading text-text-secondary">{nextSteps[selectedClause.riskLevel]}</p>
                      <p className="text-sm text-text-muted">General guidance. Have a legal reviewer check the agreement.</p>
                    </section>
                    <Button variant="outline" onClick={() => setActiveTab('chat')}><MessageSquare size={16} aria-hidden="true" /> Ask about this clause</Button>
                  </article>
                )}

                {tab === 'compare' && compareClauses.length === 2 && (
                  <div className="review-content">
                    <header className="review-reading-title">
                      <div>
                        <h2 className="section-title">Compare clauses</h2>
                        <p className="reading mt-2 text-text-secondary">{compareSummary}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={exitCompareMode}>Clear comparison</Button>
                    </header>
                    <div className="comparison-grid">
                      {compareClauses.map((clause) => (
                        <article key={clause.id} className="comparison-column">
                          <header className="grid gap-2">
                            <p className="eyebrow">{clause.number || 'Clause'}</p>
                            <h3 className="text-xl font-semibold tracking-tight">{clause.title}</h3>
                            <Badge tone={clause.riskLevel} className="capitalize">{clause.riskLevel} risk{typeof clause.riskScore === 'number' ? ` · ${clause.riskScore} / 100` : ''}</Badge>
                          </header>
                          <SourceText clause={clause} />
                          <section className="review-reading-section"><h4>Why it was flagged</h4><p className="reading text-text-secondary">{clause.riskExplanation || 'No explanation is available.'}</p></section>
                          {clause.suggestedRedline && <section className="review-reading-section"><h4>Suggested revision</h4><p className="reading text-text-secondary">{clause.suggestedRedline}</p></section>}
                          <section className="review-reading-section"><h4>Next step</h4><p className="reading text-text-secondary">{nextSteps[clause.riskLevel]}</p></section>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'chat' && selectedClause && (
                  <div className="review-content">
                    <header className="review-reading-title">
                      <div>
                        <h2 className="section-title">Ask the contract</h2>
                        <p className="reading mt-2 text-text-secondary">Selected clause · {selectedClause.number ? `${selectedClause.number}, ` : ''}{selectedClause.title}</p>
                      </div>
                      <Badge tone={wsConnected ? 'success' : 'warning'}>{wsConnected ? 'Connected' : 'Offline'}</Badge>
                    </header>
                    <div ref={chatLogRef} className="chat-transcript" role="log" aria-label="Contract chat" tabIndex={0}>
                      {chatMessages.length === 0 && (
                        <p className="margin-note reading text-text-secondary">Ask about obligations, deadlines or specific wording. Check each answer against the agreement.</p>
                      )}
                      {chatMessages.filter((message) => message.message).map((message) => (
                        <article key={message.id} className="chat-message" data-sender={message.sender}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="eyebrow">{message.sender === 'user' ? 'You' : message.message.startsWith(INCOMPLETE_ANSWER) ? 'Incomplete response' : 'AuditMind'}</p>
                            <button type="button" className="icon-control size-10" aria-label="Copy message" onClick={() => void handleCopy(message.id, message.message)}>
                              {copiedId === message.id ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                            </button>
                          </div>
                          <p className="reading whitespace-pre-wrap text-text-secondary">{message.message}</p>
                        </article>
                      ))}
                    </div>
                    <div>
                      <form className="flex gap-2" onSubmit={handleSendChat}>
                        <input className="field min-w-0 flex-1" type="text" aria-label="Ask a question about this contract"
                          placeholder="Ask a question about the contract" value={chatInput} onChange={(event) => setChatInput(event.target.value)}
                          readOnly={isChatGenerating} />
                        <Button type="submit" size="icon" aria-label="Send message" disabled={isChatGenerating || !wsConnected || !chatInput.trim()}><Send size={17} aria-hidden="true" /></Button>
                      </form>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-text-muted">
                        <span role="status">{isChatGenerating ? 'Preparing an answer…' : wsConnected ? 'Check AI answers against the contract.' : 'Chat is offline.'}</span>
                        {!wsConnected && <Button variant="outline" size="sm" onClick={() => setWsEpoch((value) => value + 1)}>Reconnect</Button>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState title={clausesLoading ? 'Opening the review' : 'Select a clause'}
                description={clausesLoading ? 'The document and findings will appear here.' : 'Open a clause to see its wording, risk explanation and any suggested revision.'} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
