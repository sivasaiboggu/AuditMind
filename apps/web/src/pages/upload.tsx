import { workspaceGuard } from '../lib/workspace-guard';
import { authenticatedFetch, sendAuthenticated } from '../lib/api';
import { ACCEPTED_EXTENSIONS, FILE_SIZE_LIMIT_BYTES, FILE_SIZE_LIMIT_MB } from '../lib/constants';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Navbar } from '../components/Navbar';
import { Button } from '../components/ui';
import { ArrowLeft, FileUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export default function UploadPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isAnalyzing, setIsAnalyzing, progress, setProgress, setActiveContract } = useContractStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const acceptanceUnknown = useRef(false);
  const uploadEpoch = useRef(0);
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const ownerCurrent = workspaceGuard();
    return () => {
      ++uploadEpoch.current;
      uploadAbort.current?.abort();
      wsRef.current?.close();
      wsRef.current = null;
      if (ownerCurrent()) { setIsAnalyzing(false); setProgress(null); }
    };
  }, [user?.id]);

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
    if (useContractStore.getState().isAnalyzing || acceptanceUnknown.current) return;
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (file.size === 0 || file.size > FILE_SIZE_LIMIT_BYTES || !ACCEPTED_EXTENSIONS.includes(extension as '.pdf' | '.docx' | '.txt')) {
      setError(`Choose a nonempty PDF, DOCX or TXT file no larger than ${FILE_SIZE_LIMIT_MB} MB.`);
      return;
    }
    const epoch = ++uploadEpoch.current;
    const ownerCurrent = workspaceGuard();
    const current = () => uploadEpoch.current === epoch && ownerCurrent();
    const controller = new AbortController();
    uploadAbort.current = controller;
    setError(null);
    setIsAnalyzing(true);
    setProgress({
      contractId: '',
      stage: 'pending',
      message: 'Uploading contract…',
      percent: 0
    });

    let requestStarted = false;
    let definiteRejection = false;

    try {
      const formData = new FormData();
      formData.append('file', file);

      requestStarted = true;
      const response = await authenticatedFetch(`${API_URL}/contracts/upload`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      if (!current()) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (!current()) return;
        definiteRejection = response.status < 500 && !['UPLOAD_ACCEPTANCE_UNKNOWN', 'QUEUE_ACCEPTANCE_UNKNOWN'].includes(errorData.code);
        if (['UPLOAD_ROLLED_BACK', 'UPLOAD_CLEANUP_PENDING'].includes(errorData.code)) definiteRejection = true;
        const reference = typeof errorData.contractId === 'string' ? ` Reference: ${errorData.contractId}.` : '';
        throw new Error((errorData.error || 'Upload could not be confirmed.') + reference);
      }

      const contract = await response.json();
      if (!current()) return;
      const contractId = contract.id;
      setActiveContract(contract);

      // 2. Open WebSocket channel to listen to processing stages in real time
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      let completed = false;
      ws.onopen = () => {
        if (!current()) { ws.close(); return; }
        console.log('// WS: Connection active. Subscribing to contract:', contractId);
        void sendAuthenticated(ws, {
          type: 'subscribe',
          contractId
        }).catch(() => ws.close(1008, 'Authentication required'));
      };

      ws.onmessage = (event) => {
        if (!current()) return;
        let payload;
        try { payload = JSON.parse(event.data); } catch { ws.close(); return; }
        if (payload.type === 'error') { ws.close(); return; }

        if (payload.type === 'progress' && payload.data?.contractId === contractId) {
          const progressData = payload.data;
          setProgress(progressData);

          if (progressData.stage === 'completed') {
            completed = true;
            ws.close();
            setIsAnalyzing(false);
            setProgress(null);
            // Navigate directly to the newly parsed contract!
            navigate(`/contract/${contractId}`);
          } else if (progressData.stage === 'failed') {
            completed = true;
            ws.close();
            setIsAnalyzing(false);
            setProgress(null);
            setError(progressData.message || 'Analysis pipeline processing failed.');
          }
        }
      };

      const interrupted = () => {
        if (!current() || completed) return;
        completed = true;
        setIsAnalyzing(false);
        setProgress(null);
        setError(`Realtime updates stopped. Check contract ${contractId} in the dashboard before uploading again.`);
      };
      ws.onerror = interrupted;
      ws.onclose = interrupted;

    } catch (err: any) {
      if (!current()) return;
      console.error('Contract upload could not be confirmed.');
      setIsAnalyzing(false);
      setProgress(null);
      const unreachable = err instanceof TypeError;
      const detail = unreachable
        ? 'Could not reach the analysis server. It appears to be offline or still starting up.'
        : (err.message || 'Upload response was interrupted.');
      if (requestStarted && !definiteRejection && !err.requestNotSent) {
        acceptanceUnknown.current = true;
        setError(`${detail} Acceptance is uncertain. Do not upload again until you check the dashboard and retained file with an operator.`);
      } else setError(detail);
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
      const file = e.target.files[0];
      // Reset the input so picking the same file again — after a rejection
      // or an interrupted upload — fires onChange instead of being ignored.
      e.target.value = '';
      handleUploadFile(file);
    }
  };

  const demo = !supabase;
  const uploadBlocked = acceptanceUnknown.current || demo;
  const percent = progress?.contractId ? Math.min(100, Math.max(0, progress.percent)) : undefined;

  return (
    <div className="min-h-screen">
      <Navbar onLogout={handleLogout} />
      <main id="main-content" tabIndex={-1} className="frame page-stack">
        <header className="entry-lead">
          <Link to="/dashboard" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-text-secondary hover:text-accent-brand">
            <ArrowLeft size={16} aria-hidden="true" /> All contracts
          </Link>
          <h1 className="page-title">Upload a contract</h1>
          <p className="lede">Choose one agreement. AuditMind extracts the clauses and opens your review when analysis finishes.</p>
        </header>
        <div className="upload-layout">
          <section className="sheet min-w-0" aria-labelledby="document-title">
            <div className="ledger-header">
              <h2 id="document-title" className="text-xl font-semibold tracking-tight">Contract file</h2>
              <span className="eyebrow">One file · up to {FILE_SIZE_LIMIT_MB} MB</span>
            </div>
            <div className="p-4 sm:p-6">
              {error && (
                <div className="margin-note mb-4 flex flex-wrap items-start justify-between gap-2 [--note-ink:var(--risk-critical)]">
                  <div>
                    <p className="font-semibold text-risk-critical">Upload needs attention</p>
                    <p role="alert" className="reading mt-1 text-text-secondary">{error}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setError(null)} aria-label="Dismiss error">Dismiss</Button>
                </div>
              )}

              {uploadBlocked ? (
                <div className="space-y-4 py-4">
                  <p className="reading text-text-secondary">
                    {demo
                      ? 'Uploading requires a configured sign-in provider. Ask the installation operator to connect one.'
                      : 'The previous file may already be in the queue. Check the contract list before trying again.'}
                  </p>
                  <Link to="/dashboard" className="action action-outline">Go to contracts</Link>
                </div>
              ) : (
                <div className="dropzone" data-active={isDragOver} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  {isAnalyzing && progress ? (
                    <div className="grid w-full max-w-md gap-3 text-left">
                      <div className="flex justify-between gap-3">
                        <p className="font-semibold" role="status">{progress.message}</p>
                        {percent !== undefined && <span className="font-mono tnum">{percent}%</span>}
                      </div>
                      <div className="upload-progress" role="progressbar" aria-label="Contract analysis progress" aria-valuenow={percent}>
                        <span style={{ '--progress': (percent ?? 0) / 100 } as CSSProperties} />
                      </div>
                      <p className="text-sm text-text-secondary">Keep this page open to go straight to the review.</p>
                    </div>
                  ) : (
                    <>
                      <FileUp size={28} strokeWidth={1.5} className="text-text-muted" aria-hidden="true" />
                      <p className="text-xl font-semibold tracking-tight">Drop a file here</p>
                      <p className="text-sm text-text-secondary">PDF, DOCX or TXT</p>
                      <input ref={fileInput} type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={handleFileChange} hidden />
                      <Button className="mt-2" onClick={() => fileInput.current?.click()}>Choose a file</Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
          <aside className="margin-note self-start">
            <h2 className="text-lg font-semibold">Before you upload</h2>
            <p className="reading mt-2 text-text-secondary">Use a file with selectable text. If the document is a scan, run OCR first.</p>
            <p className="reading mt-3 text-text-secondary">Only upload agreements you have permission to share. <Link to="/privacy" className="text-link">How files are handled</Link></p>
          </aside>
        </div>
      </main>
    </div>
  );
}
