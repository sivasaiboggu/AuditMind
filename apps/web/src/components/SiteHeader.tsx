import { ArrowUpRight, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../lib/theme';

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-2 text-[1.5rem] font-semibold tracking-[-.045em]" aria-label="AuditMind home">
      <svg className="size-7 text-accent-brand" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M5 5h16v18H5z M9 9h8m-8 5h8m-8 5h5 M21 5h3v6l-3 2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      AuditMind
    </Link>
  );
}

export function ThemeControl() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="icon-control"
    >
      {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}

export function SiteHeader({ signIn = false }: { signIn?: boolean }) {
  return (
    <header className="site-header">
      <div className="frame flex min-h-16 flex-wrap items-center justify-between gap-x-4 py-2">
        <Brand />
        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeControl />
          {signIn && <Link to="/login" className="action action-ghost">Sign in <ArrowUpRight size={16} aria-hidden="true" /></Link>}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-header border-b-0 border-t">
      <div className="frame flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-text-secondary">
        <span>AuditMind</span>
        <nav className="flex gap-5" aria-label="Legal">
          <Link className="text-link" to="/privacy">Privacy</Link>
          <Link className="text-link" to="/terms">Terms of use</Link>
        </nav>
      </div>
    </footer>
  );
}
