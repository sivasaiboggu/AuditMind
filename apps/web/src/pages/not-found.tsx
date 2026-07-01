import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Glowing 404 */}
        <div className="relative">
          <p
            className="font-mono text-[120px] font-black leading-none select-none"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.8) 0%, rgba(0,229,255,0.15) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 40px rgba(0,229,255,0.2))'
            }}
          >
            404
          </p>
          <div className="absolute inset-0 blur-3xl bg-accent-cyan/5 -z-10" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <FileQuestion className="w-5 h-5 text-text-muted" />
            <h1 className="font-mono text-sm font-bold text-text-primary uppercase tracking-widest">
              Page Not Found
            </h1>
          </div>
          <p className="text-sm font-sans text-text-secondary leading-relaxed">
            The page you're looking for doesn't exist or has been moved. Double-check the URL or navigate back to the dashboard.
          </p>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-white/5" />
          <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">AuditMind</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent-cyan/10 hover:bg-accent-cyan/20 border border-accent-cyan/30 hover:border-accent-cyan text-accent-cyan font-mono text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200"
          >
            Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white/3 hover:bg-white/5 border border-white/10 hover:border-white/20 text-text-secondary font-mono text-xs uppercase tracking-wider rounded-lg transition-all duration-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
