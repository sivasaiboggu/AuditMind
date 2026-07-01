import React from 'react';
import { useContractStore } from '../store/contractStore';
import { LayoutDashboard, FileSearch, LogOut } from 'lucide-react';

interface NavbarProps {
  currentView: 'dashboard' | 'analyzer';
  setView: (view: 'dashboard' | 'analyzer') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, setView, onLogout }) => {
  const { activeContract, user } = useContractStore();

  return (
    <header className="glass-panel border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded bg-background-base border border-accent-cyan/25 text-accent-cyan shadow-[0_0_15px_rgba(0,229,255,0.12)]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 11H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M12 8V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10.5 15H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="absolute -inset-0.5 rounded bg-accent-cyan opacity-5 blur-sm"></div>
        </div>
        <div>
          <span className="font-mono text-lg font-bold tracking-wider text-text-primary">
            AUDIT<span className="text-accent-cyan">MIND</span>
          </span>
        </div>
      </div>

      <nav className="flex items-center gap-2">
        <button
          onClick={() => setView('dashboard')}
          className={`px-4 py-2 rounded font-mono text-sm flex items-center gap-2 precise-transition ${
            currentView === 'dashboard'
              ? 'text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5 border border-transparent'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </button>

        <button
          onClick={() => activeContract && setView('analyzer')}
          disabled={!activeContract}
          className={`px-4 py-2 rounded font-mono text-sm flex items-center gap-2 precise-transition ${
            !activeContract
              ? 'opacity-40 cursor-not-allowed text-text-muted border border-transparent'
              : currentView === 'analyzer'
              ? 'text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-white/5 border border-transparent'
          }`}
        >
          <FileSearch className="w-4 h-4" />
          Analyzer {activeContract && `[${activeContract.name.substring(0, 12)}...]`}
        </button>
      </nav>

      <div className="flex items-center gap-4">
        {user && (
          <div className="hidden lg:flex flex-col text-right">
            <span className="text-xs font-mono text-text-secondary">{user.email}</span>
            <span className="text-[10px] font-mono text-accent-cyan uppercase tracking-wider">Access Granted</span>
          </div>
        )}
        
        <button
          onClick={onLogout}
          className="p-2 rounded text-text-muted hover:text-risk-critical hover:bg-risk-critical/10 border border-transparent hover:border-risk-critical/20 precise-transition"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
