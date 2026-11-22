import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/SiteHeader';

export default function NotFound() {
  return (
    <div className="public-shell">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="frame page-stack entry-layout">
        <div className="entry-lead">
          <p className="eyebrow">Error 404</p>
          <h1 className="page-title">Page not found</h1>
          <p className="lede">Check the address, or return to your contracts.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/dashboard" className="action action-primary">Go to contracts</Link>
            <button type="button" onClick={() => window.history.back()} className="action action-outline"><ArrowLeft size={16} aria-hidden="true" /> Go back</button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
