import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { AlertTriangle, ArrowLeft, Send, FileEdit, MessageSquareCode, FileText, Copy, CheckCheck, Wifi, WifiOff, Bot } from 'lucide-react';
import type { Clause, ChatMessage } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export default function ContractView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    contracts,
    setContracts,
    activeContract,
    setActiveContract,
    activeClauses,
    setActiveClauses,
    chatMessages,
    setChatMessages
  } = useContractStore();

  const [selectedClause, setSelectedClause] = useState<Clause | null>(null);
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
  const [chatInput, setChatInput] = useState('');
  const [isChatGenerating, setIsChatGenerating] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. Fetch real clauses from database on mount or ID change
  const fetchClauses = async (contractId: string) => {
    try {
      const response = await fetch(`${API_URL}/contracts/${contractId}/clauses`);
      if (response.ok) {
        const data = await response.json();
        setActiveClauses(data);
        if (data.length > 0) {
          setSelectedClause(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch contract clauses:', err);
    }
  };

  useEffect(() => {
    if (!id) return;
    const currentContract = contracts.find(c => c.id === id);
    if (currentContract) {
      setActiveContract(currentContract);
      fetchClauses(id);
    } else {
      // If the contract is not found in the local store (e.g., direct navigation or page refresh),
      // fetch the contracts from the API to see if it exists.
      const loadContract = async () => {
        try {
          const response = await fetch(`${API_URL}/contracts`);
          if (response.ok) {
            const data = await response.json();
            setContracts(data);
            const found = data.find((c: any) => c.id === id);
            if (found) {
              setActiveContract(found);
              await fetchClauses(id);
              return;
            }
          }
          navigate('/dashboard');
        } catch (err) {
          console.error('Failed to fetch contract details:', err);
          navigate('/dashboard');
        }
      };
      loadContract();
    }
  }, [id, contracts, navigate, setActiveContract, setActiveClauses, setContracts]);

  // 2. Configure WebSocket connection for real-time document chat
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('// WS: Connected to RAG chat drawer');
      setWsConnected(true);
      if (id) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          contractId: id
        }));
      }
    };

    ws.onclose = () => setWsConnected(false);

    ws.onerror = (err) => {
      console.error('WebSocket RAG chat error:', err);
    };

    return () => {
      ws.close();
    };
  }, [id]);

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

    // Map conversation payload format for Gemini
    const chatPayload = finalMessagesWithAssistant
      .filter(m => m.message) // skip empty last msg
      .map(m => ({
        role: m.sender === 'user' ? ('user' as const) : ('model' as const),
        content: m.message
      }));

    // Send chat payload through WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      contractId: id,
      messages: chatPayload
    }));

    let accumulatedResponse = '';

    // Handle WebSocket responses specifically for streaming
    wsRef.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === 'token') {
        accumulatedResponse += payload.token;
        // Update the assistant message in place
        setChatMessages(
          finalMessagesWithAssistant.map(m => 
            m.id === assistantMsgId
              ? { ...m, message: accumulatedResponse }
              : m
          )
        );
      } else if (payload.type === 'chat_end') {
        setIsChatGenerating(false);
      } else if (payload.type === 'error') {
        setIsChatGenerating(false);
        setChatMessages([
          ...chatMessages,
          {
            id: `msg-error-${Math.random().toString(36).substring(2, 9)}`,
            sessionId: 'session-001',
            sender: 'assistant',
            message: `[Gemini API Error: ${payload.message}]`,
            createdAt: new Date().toISOString()
          }
        ]);
      }
    };
  };

  const getRiskBorder = (level: string) => {
    switch (level) {
      case 'critical': return 'border-l-4 border-risk-critical';
      case 'high': return 'border-l-4 border-risk-high';
      case 'medium': return 'border-l-4 border-risk-medium';
      default: return 'border-l-4 border-risk-low';
    }
  };

  const getRiskBgClass = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-risk-critical/10 text-risk-critical border-risk-critical/20';
      case 'high': return 'bg-risk-high/10 text-risk-high border-risk-high/20';
      case 'medium': return 'bg-risk-medium/10 text-risk-medium border-risk-medium/20';
      default: return 'bg-risk-low/10 text-risk-low border-risk-low/20';
    }
  };

  return (
    <div className="h-screen bg-background-base flex flex-col overflow-hidden">
      <Navbar currentView="analyzer" setView={(v) => navigate(v === 'dashboard' ? '/dashboard' : '/upload')} onLogout={handleLogout} />
      
      {/* Sub Header */}
      <div className="bg-background-panel border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 rounded hover:bg-white/5 border border-transparent hover:border-white/10 text-text-secondary hover:text-text-primary precise-transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-mono font-bold text-text-primary uppercase tracking-wide">
              {activeContract?.name || 'ANALYZER MODE'}
            </h2>
          </div>
        </div>

        <div className="flex gap-2">
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-risk-critical/30 text-risk-critical bg-risk-critical/5">
            CRITICAL: {activeClauses.filter(c => c.riskLevel === 'critical').length}
          </span>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-risk-high/30 text-risk-high bg-risk-high/5">
            HIGH: {activeClauses.filter(c => c.riskLevel === 'high').length}
          </span>
          <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-risk-medium/30 text-risk-medium bg-risk-medium/5">
            MED: {activeClauses.filter(c => c.riskLevel === 'medium').length}
          </span>
        </div>
      </div>

      {/* Side by Side */}
      <div className="flex-grow flex overflow-hidden">
        {/* Left Side */}
        <div className="w-1/2 border-r border-white/5 flex flex-col bg-background-base overflow-hidden">
          <div className="border-b border-white/5 p-4 flex items-center gap-2 bg-white/1">
            <FileText className="w-4 h-4 text-accent-cyan" />
            <span className="text-xs font-mono font-bold text-text-secondary uppercase">
              Contract Clauses
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeClauses.length === 0 ? (
              <div className="p-12 text-center text-text-muted font-mono text-xs animate-pulse">
                Analyzing contract clauses...
              </div>
            ) : (
              activeClauses.map((clause) => (
                <div
                  key={clause.id}
                  onClick={() => setSelectedClause(clause)}
                  className={`p-4 rounded border glass-panel precise-transition cursor-pointer ${getRiskBorder(clause.riskLevel)} ${
                    selectedClause?.id === clause.id
                      ? 'border-accent-cyan bg-accent-cyan/5 shadow-[0_0_15px_rgba(0,229,255,0.03)]'
                      : 'border-white/5 hover:border-white/10 hover:bg-white/2'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <span className="font-mono text-xs font-bold text-text-primary">
                      {clause.number ? `[${clause.number}]` : ''} {clause.title}
                    </span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold tracking-wider ${getRiskBgClass(clause.riskLevel)}`}>
                      {clause.riskLevel}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary font-sans line-clamp-3 leading-relaxed">
                    {clause.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side — Tab Layout */}
        <div className="w-1/2 flex flex-col bg-background-panel/50 overflow-hidden">
          {selectedClause ? (
            <div className="flex-grow flex flex-col overflow-hidden">

              {/* Tab Bar */}
              <div className="border-b border-white/5 flex items-center bg-background-panel/80 px-4 gap-1 pt-2 flex-shrink-0">
                <button
                  onClick={() => setActiveTab('analysis')}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-t border-b-2 precise-transition flex items-center gap-1.5 ${
                    activeTab === 'analysis'
                      ? 'text-text-primary border-accent-cyan bg-accent-cyan/5'
                      : 'text-text-muted border-transparent hover:text-text-secondary hover:border-white/20'
                  }`}
                >
                  <FileText className="w-3 h-3" />
                  Analysis
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-t border-b-2 precise-transition flex items-center gap-1.5 ${
                    activeTab === 'chat'
                      ? 'text-text-primary border-accent-cyan bg-accent-cyan/5'
                      : 'text-text-muted border-transparent hover:text-text-secondary hover:border-white/20'
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
              {activeTab === 'analysis' && (
                <div className="flex-grow overflow-y-auto p-6 space-y-5">
                  <div className="flex justify-between items-start border-b border-white/5 pb-4">
                    <div>
                      <span className="font-mono text-xs text-accent-cyan uppercase tracking-widest block mb-1">
                        Clause Analysis
                      </span>
                      <h3 className="text-lg font-mono font-bold text-text-primary">
                        {selectedClause.number ? `${selectedClause.number}: ` : ''}{selectedClause.title}
                      </h3>
                    </div>
                    <div className={`px-3 py-1.5 rounded font-mono text-xs uppercase font-bold border ${getRiskBgClass(selectedClause.riskLevel)}`}>
                      {selectedClause.riskLevel} Risk
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block">
                      Original Clause
                    </span>
                    <div className="p-4 bg-background-base border border-white/5 rounded-lg font-sans text-sm text-text-secondary leading-relaxed select-text">
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
                      </div>
                      <div className="p-4 bg-risk-low/5 border border-risk-low/10 rounded-lg font-sans text-sm text-text-secondary leading-relaxed">
                        <div className="text-xs font-mono text-text-muted mb-2">PROPOSED AMENDMENT:</div>
                        <div className="text-risk-low border-l-2 border-risk-low/30 pl-3 italic">
                          {selectedClause.suggestedRedline}
                        </div>
                      </div>
                    </div>
                  )}

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

              {/* Chat Tab — full height */}
              {activeTab === 'chat' && (
                <div className="flex-grow flex flex-col overflow-hidden">
                  {/* Chat context pill */}
                  <div className="px-4 py-2 flex-shrink-0 border-b border-white/5 bg-background-base/20">
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
                  <div className="flex-grow overflow-y-auto p-4 space-y-3">
                    {/* Welcome bubble */}
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-accent-cyan" />
                      </div>
                      <div className="bg-white/3 border border-white/8 px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm font-sans text-text-secondary leading-relaxed flex-1 max-w-[90%]">
                        <span className="block text-[10px] font-mono text-accent-cyan mb-1 uppercase tracking-wider">AuditMind</span>
                        Ask me anything about this contract — clause obligations, risk implications, breach scenarios, or deadline triggers.
                      </div>
                    </div>

                    {chatMessages.map((msg) => {
                      const isLocalSearch = msg.message.includes('Local Search Mode') || msg.message.includes('⚠️') || msg.message.includes('⚠');
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
                              ? 'bg-amber-500/5 border-amber-500/20 rounded-bl-sm text-amber-200'
                              : 'bg-white/3 border-white/8 rounded-bl-sm text-text-secondary'
                          }`}>
                            {!isUser && (
                              <span className={`block text-[9px] font-mono mb-1.5 uppercase tracking-wider ${
                                isLocalSearch ? 'text-amber-400 font-bold' : 'text-text-muted'
                              }`}>
                                {isLocalSearch ? '⚠ Local Search Mode' : 'AuditMind'}
                              </span>
                            )}
                            <div className="whitespace-pre-line select-text">{msg.message}</div>
                            {/* Hover copy button */}
                            <button
                              onClick={() => handleCopy(msg.id, msg.message)}
                              className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 bg-background-panel border border-white/10 p-1 rounded-md text-text-muted hover:text-text-primary precise-transition shadow-lg"
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
                        <div className="bg-white/3 border border-white/8 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'0ms'}} />
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'160ms'}} />
                          <span className="w-2 h-2 rounded-full bg-accent-cyan/60 animate-bounce" style={{animationDelay:'320ms'}} />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="flex-shrink-0 border-t border-white/5 bg-background-panel/60 p-4">
                    <form onSubmit={handleSendChat} className="flex gap-2.5 items-center">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={isChatGenerating ? 'AuditMind is thinking...' : "Ask a question about this contract..."}
                        disabled={isChatGenerating}
                        className="flex-grow bg-background-base border border-white/10 outline-none rounded-xl py-3 px-4 text-sm font-sans text-text-primary placeholder:text-text-muted/50 focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 precise-transition disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={isChatGenerating || !wsConnected}
                        className="w-10 h-10 bg-accent-cyan/15 hover:bg-accent-cyan/25 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan rounded-xl precise-transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0"
                        title="Send"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                    <p className="text-[10px] text-text-muted/40 font-mono mt-2 text-center">
                      {wsConnected ? 'Connected · Powered by AuditMind RAG' : 'Connecting to AI service...'}
                    </p>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-text-muted p-8 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-white/3 border border-white/8 flex items-center justify-center">
                <FileText className="w-7 h-7 text-text-muted/50" />
              </div>
              <div>
                <p className="font-mono text-sm uppercase tracking-widest mb-2 text-text-secondary">No Clause Selected</p>
                <p className="text-xs text-text-muted/60 max-w-xs leading-relaxed">Click any clause on the left panel to view its risk analysis, suggested revisions, and ask AI questions.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
