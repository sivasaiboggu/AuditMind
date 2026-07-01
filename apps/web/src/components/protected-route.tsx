import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background-base flex flex-col items-center justify-center gap-6">
        {/* Animated logo pulse */}
        <div className="relative">
          <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
            <div className="w-5 h-5 rounded border-2 border-accent-cyan/40 border-t-accent-cyan animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-xl bg-accent-cyan/5 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        {/* Status text */}
        <div className="text-center space-y-1">
          <p className="font-mono text-xs text-accent-cyan uppercase tracking-[0.2em] animate-pulse">
            Verifying Session
          </p>
          <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
            Stand By...
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-48 h-0.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-cyan/60 rounded-full"
            style={{
              animation: 'loadingBar 1.5s ease-in-out infinite',
              width: '40%',
            }}
          />
        </div>

        <style>{`
          @keyframes loadingBar {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(150%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
