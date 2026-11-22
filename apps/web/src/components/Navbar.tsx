import React from 'react';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { LayoutDashboard, FileSearch, LogOut, Moon, Sun } from 'lucide-react';

interface NavbarProps {
  currentView: 'dashboard' | 'analyzer';
  setView: (view: 'dashboard' | 'analyzer') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setView, onLogout }) => {
  const { activeContract } = useContractStore();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="bg-background-panel border-b border-overlay/5 px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center justify-between shrink-0 sticky top-0 z-50">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-10 h-10 rounded bg-background-base border border-accent-cyan/25 text-accent-cyan">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 11H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 8V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10.5 15H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <span className="font-mono text-lg font-bold tracking-wider text-text-primary">
            AUDIT<span className="text-accent-cyan">MIND</span>
          </span>
        </div>
      </div>

      <nav className="flex items-center gap-2 order-3 w-full sm:order-none sm:w-auto" aria-label="Primary">
        <button
          onClick={() => setView('dashboard')}
          aria-current={currentView === 'dashboard' ? 'page' : undefined}
          className={`px-3 py-2 min-h-11 rounded font-mono text-xs sm:text-sm flex items-center gap-2 precise-transition ${
            currentView === 'dashboard'
              ? 'text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-overlay/5 border border-transparent'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>

        <button
          onClick={() => activeContract && setView('analyzer')}
          disabled={!activeContract}
          aria-current={currentView === 'analyzer' ? 'page' : undefined}
          className={`px-3 py-2 min-h-11 rounded font-mono text-xs sm:text-sm flex items-center gap-2 precise-transition ${
            !activeContract
              ? 'opacity-40 cursor-not-allowed text-text-muted border border-transparent'
              : currentView === 'analyzer'
              ? 'text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-overlay/5 border border-transparent'
          }`}
        >
          <FileSearch className="w-4 h-4" />
          Analyzer
        </button>
      </nav>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-pressed={theme === 'dark'}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="p-2 rounded text-text-muted hover:text-text-primary hover:bg-overlay/5 border border-transparent hover:border-overlay/10 precise-transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-mono font-bold text-text-primary">
                {user.fullName || user.email.split('@')[0]}
              </span>
              <span className="text-[9px] font-mono text-accent-cyan uppercase tracking-wider">
                {user.email}
              </span>
            </div>
            
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Profile"
                className="w-8 h-8 rounded-full border border-accent-cyan/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-accent-cyan/10 border border-accent-cyan/30 flex items-center justify-center text-xs font-mono font-bold text-accent-cyan">
                {(user.email[0] || '?').toUpperCase()}
              </div>
            )}
          </div>
        )}
        
        <button
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign Out"
          className="p-2 rounded text-text-muted hover:text-risk-critical hover:bg-risk-critical/10 border border-transparent hover:border-risk-critical/20 precise-transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
