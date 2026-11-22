import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export function RouteLoading({ message }: { message: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="frame page-stack">
      <p className="margin-note reading text-text-secondary" role="status">{message}</p>
    </main>
  );
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <RouteLoading message="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Fragment key={user.id}>{children}</Fragment>;
}
