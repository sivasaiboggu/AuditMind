import React from 'react';
import { RotateCcw } from 'lucide-react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AuditMind]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main id="main-content" tabIndex={-1} className="frame page-stack">
        <div className="entry-lead">
          <p className="eyebrow">Application error</p>
          <h1 className="page-title">This page couldn’t load</h1>
          <p className="lede">Reload the page to try again, or return to your contracts.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="action action-primary" onClick={() => window.location.reload()}><RotateCcw size={16} aria-hidden="true" /> Reload page</button>
            <a href="/dashboard" className="action action-outline">Go to contracts</a>
          </div>
        </div>
      </main>
    );
  }
}
