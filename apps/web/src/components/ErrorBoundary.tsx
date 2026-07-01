import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AuditMind ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background-base flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-risk-critical/10 border border-risk-critical/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-risk-critical" />
            </div>
            <div>
              <h1 className="font-mono text-lg font-bold text-text-primary uppercase tracking-widest mb-2">
                Unexpected Error
              </h1>
              <p className="text-sm font-sans text-text-secondary leading-relaxed">
                AuditMind encountered an unexpected error. This has been logged and our team will investigate.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-background-panel border border-white/5 rounded-lg p-4 text-left">
                <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest mb-2">Error Details</p>
                <p className="font-mono text-xs text-risk-critical break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/dashboard';
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan font-mono text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 cursor-pointer"
            >
              <RefreshCcw className="w-4 h-4" />
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
