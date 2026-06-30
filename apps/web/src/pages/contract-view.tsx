import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { AlertTriangle, ArrowLeft, Send, FileEdit, MessageSquareCode, FileText } from 'lucide-react';
import type { Clause, ChatMessage } from '@auditmind/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export default function ContractView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    contracts,
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
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
      navigate('/dashboard');
    }
  }, [id, contracts, navigate, setActiveContract, setActiveClauses]);

  // 2. Configure WebSocket connection for real-time document chat
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('// WS: Connected to RAG chat drawer');
      if (id) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          contractId: id
        }));
      }
    };

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
        alert(`Agent error: ${payload.message}`);
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
    <div className="min-h-screen bg-background-base flex flex-col overflow-hidden">
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
            <p className="text-[10px] font-mono text-text-muted uppercase">
              Hash ID: {activeContract?.id || 'NO_UUID'}
            </p>
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
      <div className="flex-grow flex h-[calc(100vh-125px)] overflow-hidden">
        {/* Left Side */}
        <div className="w-1/2 border-r border-white/5 flex flex-col bg-background-base overflow-hidden">
          <div className="border-b border-white/5 p-4 flex items-center gap-2 bg-white/1">
            <FileText className="w-4 h-4 text-accent-cyan" />
            <span className="text-xs font-mono font-bold text-text-secondary uppercase">
              Extracted Clause List
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeClauses.length === 0 ? (
              <div className="p-12 text-center text-text-muted font-mono text-xs animate-pulse">
                PARSING AND VECTORIZING CLAUSES // STAND BY
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
                      Deep Risk Assessment
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
                    Original Clause text
                  </span>
                  <div className="p-4 bg-background-base border border-white/5 rounded font-sans text-sm text-text-secondary leading-relaxed select-text">
                    {selectedClause.text}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-risk-high" />
                    <span className="text-[10px] font-mono text-text-primary uppercase tracking-widest block">
                      Vulnerability Assessment
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
                        Suggested Redline Configuration
                      </span>
                    </div>
                    <div className="p-4 bg-risk-low/5 border border-risk-low/10 rounded font-sans text-sm text-text-secondary leading-relaxed overflow-hidden">
                      <div className="text-xs font-mono text-text-muted mb-2">// AMENDMENT PROPOSAL:</div>
                      <div className="text-risk-low border-l-2 border-risk-low/30 pl-3 italic">
                        {selectedClause.suggestedRedline}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* WebSocket RAG Chat Drawer */}
              <div className="h-[240px] border-t border-white/5 bg-background-panel flex flex-col overflow-hidden">
                <div className="border-b border-white/5 px-4 py-2 flex items-center justify-between bg-white/1">
                  <div className="flex items-center gap-2 text-text-primary">
                    <MessageSquareCode className="w-4 h-4 text-accent-cyan" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">
                      Interactive Document Agent
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-risk-low uppercase bg-risk-low/5 border border-risk-low/20 px-1.5 py-0.5 rounded animate-pulse">
                    live socket connected
                  </span>
                </div>

                <div className="flex-grow overflow-y-auto p-4 space-y-3">
                  <div className="bg-white/2 border border-white/5 p-3 rounded text-xs font-sans text-text-secondary leading-relaxed">
                    <span className="font-mono text-[10px] text-accent-cyan block mb-1">SYSTEM INSTANCE // AUDITMIND AGENT</span>
                    Ask specific questions about constraints, loopholes, liabilities, or deadlines within the current agreement.
                  </div>
                  
                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded text-xs font-sans leading-relaxed border ${
                        msg.sender === 'user'
                          ? 'bg-accent-cyan/5 border-accent-cyan/10 ml-6 text-text-primary'
                          : 'bg-white/2 border-white/5 mr-6 text-text-secondary'
                      }`}
                    >
                      <span className="font-mono text-[9px] text-text-muted block mb-1">
                        {msg.sender === 'user' ? 'USER ANALYST' : 'AUDITMIND AGENT'}
                      </span>
                      <div className="whitespace-pre-line select-text font-sans">{msg.message}</div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChat} className="border-t border-white/5 p-3 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={isChatGenerating ? "Generating response..." : "Ask e.g., 'What happens if we breach section 4.2?'"}
                    disabled={isChatGenerating}
                    className="flex-grow bg-background-base border border-white/10 outline-none rounded py-2 px-3 text-xs font-mono text-text-primary focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 precise-transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isChatGenerating}
                    className="p-2 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan rounded precise-transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center text-text-muted font-mono text-sm p-6 text-center">
              SELECT A CLAUSE FROM THE DOCUMENT LIST TO ACCESS RISK DETAILS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
