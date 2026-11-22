import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import { ThemeProvider } from './lib/theme';
import { ProtectedRoute, RouteLoading } from './components/protected-route';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageTransition } from './components/PageTransition';
import Landing from './pages/landing';

const Login = lazy(() => import('./pages/login'));
const Dashboard = lazy(() => import('./pages/dashboard'));
const ContractView = lazy(() => import('./pages/contract-view'));
const Upload = lazy(() => import('./pages/upload'));
const NotFound = lazy(() => import('./pages/not-found'));
const Legal = lazy(() => import('./pages/legal'));

const routeTitles: Record<string, string> = {
  '/': 'Contract risk review',
  '/login': 'Sign in',
  '/dashboard': 'Contracts',
  '/upload': 'Upload a contract',
  '/privacy': 'Privacy',
  '/terms': 'Terms of use',
};

function AppRoutes() {
  const { pathname } = useLocation();
  useEffect(() => {
    const review = pathname.startsWith('/contract/');
    const path = pathname.replace(/\/$/, '') || '/';
    const title = routeTitles[path] || (review ? 'Contract review' : 'Page not found');
    document.title = `${title} · AuditMind`;
    document.querySelector('meta[name="robots"]')?.setAttribute(
      'content', ['/', '/terms', '/privacy'].includes(path) ? 'index, follow' : 'noindex, follow',
    );
  }, [pathname]);
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Suspense fallback={<RouteLoading message="Opening page…" />}>
        <PageTransition key={pathname}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/contract/:id" element={<ProtectedRoute><ContractView /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
            <Route path="/privacy" element={<Legal kind="privacy" />} />
            <Route path="/terms" element={<Legal kind="terms" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </PageTransition>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
