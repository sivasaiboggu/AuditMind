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

        {/* Right Side */}
        <div className="w-1/2 flex flex-col bg-background-panel/50 overflow-hidden">
          {selectedClause ? (
            <div className="flex-grow flex flex-col overflow-hidden">
              <div className="flex-grow overflow-y-auto p-6 space-y-6">
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
                    {selectedClause.riskLevel} Risk Tier
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-text-secondary uppercase tracking-widest block">
                    Original Clause
                  </span>
                  <div className="p-4 bg-background-base border border-white/5 rounded font-sans text-sm text-text-secondary leading-relaxed select-text">
                    {selectedClause.text}
                  </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-risk-high" />
                      <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest block">
                        Risk Explanation
                      </span>
                    </div>
                  <div className="p-4 bg-risk-critical/5 border border-risk-critical/10 rounded font-sans text-sm text-text-secondary leading-relaxed">
                    {selectedClause.riskExplanation}
                  </div>
                </div>

                {selectedClause.suggestedRedline && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileEdit className="w-4 h-4 text-risk-low" />
                      <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest block">
                        Suggested Revision
                      </span>
                    </div>
                    <div className="p-4 bg-risk-low/5 border border-risk-low/10 rounded font-sans text-sm text-text-secondary leading-relaxed overflow-hidden">
                      <div className="text-xs font-mono text-text-muted mb-2">PROPOSED AMENDMENT:</div>
                      <div className="text-risk-low border-l-2 border-risk-low/30 pl-3 italic">
                        {selectedClause.suggestedRedline}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* WebSocket RAG Chat Drawer */}
              <div className="h-[270px] border-t border-white/5 bg-background-panel flex flex-col overflow-hidden">
                <div className="border-b border-white/5 px-4 py-2 flex items-center justify-between bg-white/1">
                  <div className="flex items-center gap-2 text-text-primary">
                    <MessageSquareCode className="w-4 h-4 text-accent-cyan" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Document Q&A
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isChatGenerating && (
                      <span className="text-[9px] font-mono text-risk-medium uppercase bg-risk-medium/5 border border-risk-medium/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <span className="inline-block w-1 h-1 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'0ms'}} />
                        <span className="inline-block w-1 h-1 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'150ms'}} />
                        <span className="inline-block w-1 h-1 rounded-full bg-risk-medium animate-bounce" style={{animationDelay:'300ms'}} />
                      </span>
                    )}
                    {wsConnected ? (
                      <span className="text-[9px] font-mono text-risk-low uppercase bg-risk-low/5 border border-risk-low/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Wifi className="w-2.5 h-2.5" /> Live
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-risk-medium uppercase bg-risk-medium/5 border border-risk-medium/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" /> Offline
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto p-3 space-y-2">
                  {/* Welcome message */}
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3 h-3 text-accent-cyan" />
                    </div>
                    <div className="bg-white/2 border border-white/5 p-2.5 rounded-lg rounded-tl-none text-xs font-sans text-text-secondary leading-relaxed flex-1">
                      Ask questions about this contract — obligations, risks, deadlines, or clause implications.
                    </div>
                  </div>
                  
                  {chatMessages.map((msg) => {
                    const isLocalSearch = msg.message.includes('Local Search Mode') || msg.message.includes('⚠️');
                    const isUser = msg.sender === 'user';
                    return (
                      <div key={msg.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                        {!isUser && (
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                            isLocalSearch
                              ? 'bg-risk-medium/10 border-risk-medium/30'
                              : 'bg-accent-cyan/10 border-accent-cyan/20'
                          }`}>
                            <Bot className={`w-3 h-3 ${isLocalSearch ? 'text-risk-medium' : 'text-accent-cyan'}`} />
                          </div>
                        )}
                        <div className={`relative group p-2.5 rounded-lg text-xs font-sans leading-relaxed max-w-[88%] border ${
                          isUser
                            ? 'bg-accent-cyan/8 border-accent-cyan/15 rounded-tr-none text-text-primary'
                            : isLocalSearch
                            ? 'bg-risk-medium/5 border-risk-medium/20 rounded-tl-none text-risk-medium'
                            : 'bg-white/2 border-white/5 rounded-tl-none text-text-secondary'
                        }`}>
                          {!isUser && (
                            <span className={`font-mono text-[9px] block mb-1 ${
                              isLocalSearch ? 'text-risk-medium font-bold' : 'text-text-muted'
                            }`}>
                              {isLocalSearch ? '⚠ AuditMind · Local Search Mode' : 'AuditMind'}
                            </span>
                          )}
                          <div className="whitespace-pre-line select-text">{msg.message}</div>
                          {/* Copy button */}
                          <button
                            onClick={() => handleCopy(msg.id, msg.message)}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-muted hover:text-text-primary precise-transition"
                          >
                            {copiedId === msg.id
                              ? <CheckCheck className="w-3 h-3 text-risk-low" />
                              : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Animated typing indicator */}
                  {isChatGenerating && chatMessages[chatMessages.length - 1]?.message === '' && (
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-3 h-3 text-accent-cyan" />
                      </div>
                      <div className="bg-white/2 border border-white/5 p-2.5 rounded-lg rounded-tl-none flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-bounce" style={{animationDelay:'0ms'}} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-bounce" style={{animationDelay:'150ms'}} />
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-bounce" style={{animationDelay:'300ms'}} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChat} className="border-t border-white/5 p-2.5 flex gap-2 bg-background-base/30">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isChatGenerating ? 'AuditMind is thinking...' : "Ask e.g., 'What happens if we breach section 4.2?'"}
                    disabled={isChatGenerating}
                    className="flex-grow bg-background-base border border-white/10 outline-none rounded-lg py-2 px-3 text-xs font-sans text-text-primary placeholder:text-text-muted focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 precise-transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isChatGenerating || !wsConnected}
                    className="px-3 py-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan rounded-lg precise-transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-text-muted p-8 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/3 border border-white/8 flex items-center justify-center">
                <FileText className="w-5 h-5 text-text-muted" />
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-widest mb-1">No Clause Selected</p>
                <p className="text-xs text-text-muted/60">Click any clause on the left to view its risk analysis, suggested revisions, and ask questions.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
