import { LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useContractStore } from '../store/contractStore';
import { useAuth } from '../lib/auth-context';
import { Brand, ThemeControl } from './SiteHeader';

export function Navbar({ onLogout }: { onLogout: () => Promise<void> }) {
  const activeContract = useContractStore((state) => state.activeContract);
  const { user } = useAuth();

  return (
    <header className="site-header workspace-header">
      <div className="frame wide-frame workspace-nav">
        <Brand to="/dashboard" />
        <nav className="workspace-links" aria-label="Workspace">
          <NavLink to="/dashboard">Contracts</NavLink>
          <NavLink to="/upload">Upload</NavLink>
          {activeContract && <NavLink to={`/contract/${activeContract.id}`}>Review</NavLink>}
        </nav>
        <div className="workspace-account">
          {user && <span className="hidden max-w-44 truncate text-sm text-text-secondary lg:block" title={user.email}>{user.fullName || user.email}</span>}
          <ThemeControl />
          <button type="button" onClick={() => void onLogout().catch((error: unknown) => {
            window.alert(error instanceof Error ? error.message : 'Sign-out could not be confirmed.');
          })} aria-label="Sign out" className="icon-control">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
