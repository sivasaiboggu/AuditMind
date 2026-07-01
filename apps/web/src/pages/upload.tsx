import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { Upload, ArrowLeft, Terminal } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export default function UploadPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isAnalyzing, setIsAnalyzing, progress, setProgress, setActiveContract } = useContractStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Cleanup WebSocket on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleUploadFile = async (file: File) => {
    setError(null);
    setIsAnalyzing(true);
    setProgress({
      contractId: '',
      stage: 'pending' as any,
      message: 'Uploading document to secure vaults...',
      percent: 5
    });

    let uploadTimer: any = null;
    let uploadPercent = 5;

    try {
      // Smoothly animate the loading percentage during the network payload upload
      uploadTimer = setInterval(() => {
        if (uploadPercent < 45) {
          uploadPercent += 3;
          setProgress({
            contractId: '',
            stage: 'pending' as any,
            message: 'Uploading contract to database...',
            percent: uploadPercent
          });
        }
      }, 300);

      // 1. Send file via multipart Form Data to Fastify API
      const formData = new FormData();
      formData.append('file', file);

      const query = user?.id ? `?userId=${user.id}` : '';
      const response = await fetch(`${API_URL}/contracts/upload${query}`, {
        method: 'POST',
        body: formData
      });

      if (uploadTimer) clearInterval(uploadTimer);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload file to backend server');
      }

      const contract = await response.json();
      const contractId = contract.id;
      setActiveContract(contract);

      // 2. Open WebSocket channel to listen to processing stages in real time
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('// WS: Connection active. Subscribing to contract:', contractId);
        ws.send(JSON.stringify({
          type: 'subscribe',
          contractId
        }));
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        console.log('// WS Event Received:', payload);

        if (payload.type === 'progress') {
          const progressData = payload.data;
          setProgress(progressData);

          if (progressData.stage === 'completed') {
            ws.close();
            setIsAnalyzing(false);
            setProgress(null);
            // Navigate directly to the newly parsed contract!
            navigate(`/contract/${contractId}`);
          } else if (progressData.stage === 'failed') {
            ws.close();
            setIsAnalyzing(false);
            setProgress(null);
            setError(progressData.message || 'Analysis pipeline processing failed.');
          }
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket connection error:', err);
        setIsAnalyzing(false);
        setProgress(null);
        setError('Realtime update pipeline connection was interrupted.');
      };

    } catch (err: any) {
      if (uploadTimer) clearInterval(uploadTimer);
      console.error(err);
      setIsAnalyzing(false);
      setProgress(null);
      setError(err.message || 'Failed to ingest document file.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-background-base flex flex-col">
      <Navbar currentView="analyzer" setView={(v) => navigate(v === 'dashboard' ? '/dashboard' : '/upload')} onLogout={handleLogout} />
      
      <main className="flex-grow max-w-3xl mx-auto px-6 py-12 w-full flex flex-col justify-center">
        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 rounded hover:bg-white/5 border border-transparent hover:border-white/10 text-text-secondary hover:text-text-primary precise-transition"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <span className="text-xs font-sans text-text-secondary font-medium">Back to dashboard</span>
        </div>

        <div className="glass-panel p-8 rounded border border-white/5 space-y-6">
          <div>
            <h2 className="text-xl font-sans font-medium text-text-primary tracking-tight">
              Upload contract
            </h2>
            <p className="text-sm text-text-secondary font-sans mt-1">
              Choose a contract file to analyze risk.
            </p>
          </div>

          {error && (
            <div className="bg-risk-critical/10 border border-risk-critical/30 rounded p-4 text-xs font-mono text-risk-critical flex gap-3 items-start relative animate-fade-in shadow-[0_0_15px_rgba(255,77,77,0.05)]">
              <Terminal className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-grow space-y-1.5">
                <div className="font-bold text-sm tracking-tight">INGESTION DIAGNOSTIC WARNING</div>
                <div className="leading-relaxed text-text-primary/95">{error}</div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-[10px] text-text-muted hover:text-text-primary uppercase tracking-widest font-bold precise-transition"
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`min-h-[260px] rounded border border-dashed flex flex-col items-center justify-center p-6 text-center precise-transition ${
              isDragOver
                ? 'border-accent-cyan bg-accent-cyan/5'
                : 'border-white/10 hover:border-white/20 bg-background-base/30'
            }`}
          >
            {isAnalyzing && progress ? (
              <div className="space-y-4 w-full max-w-md">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-accent-cyan uppercase tracking-wider">{progress.message}</span>
                  <span className="text-text-secondary">{progress.percent}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="bg-accent-cyan h-1.5 precise-transition"
                    style={{ width: `${progress.percent}%` }}
                  ></div>
                </div>
                <p className="text-xs font-sans text-text-secondary">
                  Analyzing contract... Please keep this page open.
                </p>
              </div>
            ) : (
              <label className="cursor-pointer group flex flex-col items-center gap-3">
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded bg-white/5 border border-white/10 text-text-secondary group-hover:text-accent-cyan group-hover:border-accent-cyan/40 flex items-center justify-center precise-transition shadow-lg">
                  <Upload className="w-5 h-5 group-hover:scale-110 precise-transition" />
                </div>
                <div>
                  <p className="font-sans text-sm font-medium text-text-primary group-hover:text-accent-cyan precise-transition">
                    Select contract document
                  </p>
                  <p className="text-xs text-text-secondary font-sans mt-1">
                    Drag and drop PDF or DOCX file (Max 15MB)
                  </p>
                </div>
              </label>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
