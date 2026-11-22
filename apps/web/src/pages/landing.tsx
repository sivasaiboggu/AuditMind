import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme';
import { APP_VERSION } from '../lib/constants';
import { ArrowRight, Moon, Sun } from 'lucide-react';

/** How it works, as numbered steps — a list with dividers, not three
 * identical cards. Each step names what the visitor gets, in one line. */
const STEPS = [
  {
    number: '01',
    title: 'Upload a contract',
    description: 'A PDF, DOCX or TXT file, up to 15 MB. The text is extracted and split into clauses.',
  },
  {
    number: '02',
    title: 'Review rules score every clause',
    description: 'Deterministic rules run locally on CPU. A reviewed local classifier can be enabled instead; no model is downloaded by default.',
  },
  {
    number: '03',
    title: 'Read the explanation, ask questions',
    description: 'Each clause gets a plain-English risk note and a suggested revision. Ask the contract questions and get answers grounded in its own text.',
  },
];

/** What the review workspace does, and the limits, stated plainly. */
const OUTCOMES = [
  'Search and filter clauses by risk level',
  'Compare any two clauses side by side',
  'Move through the list with the arrow keys',
  'Export a Markdown risk report for the contract',
  'General next steps for each risk level',
];

const LIMITS = [
  'Outputs need human review — this is not legal advice',
  'Retrieval only cites a corpus you configured; none is invented',
  'Explanations need a Gemini key, or you get a labelled rule-based summary',
  'Scanned images need OCR before upload — no readable text, no review',
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Auto-redirect if session is active
  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-background-base">
      {/* Header */}
      <header className="border-b border-overlay/5 bg-background-base z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-background-base border border-accent-cyan/25 text-accent-cyan flex items-center justify-center">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 11H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M12 8V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.5 15H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-mono font-bold text-lg tracking-wider text-text-primary">
              AUDIT<span className="text-accent-cyan">MIND</span>
            </span>
          </div>

          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="p-2 rounded text-text-muted hover:text-text-primary hover:bg-overlay/5 border border-transparent hover:border-overlay/10 precise-transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Hero — left-aligned, one statement, no pill, no gradient. */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-16 z-10 flex-grow flex flex-col justify-center w-full">
        <div className="max-w-3xl">
          <h1 className="display-lg text-balance mb-6 text-text-primary">
            Contract risk analysis,
            <br />
            <span className="text-accent-cyan">
              backed by validated review rules.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary mb-8 max-w-2xl leading-relaxed body-md">
            Upload any legal agreement. AuditMind extracts every clause, scores
            risk with validated review rules, and explains each finding in plain
            English — with an optional local classifier and retrieval-grounded
            references where configured. Outputs need human review.
          </p>

          <div className="flex flex-wrap gap-4">
            <Link to="/login" className="px-6 py-3 rounded-lg bg-accent-cyan hover:bg-accent-cyan/90 text-background-base font-mono font-bold text-sm precise-transition flex items-center gap-2 shadow-card">
              Start Analysis <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className="px-6 py-3 rounded-lg text-text-primary font-mono text-sm border border-overlay/10 hover:border-overlay/20 precise-transition flex items-center">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* How it works — numbered steps, dividers, no cards. */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 z-10 scroll-mt-8 w-full">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary mb-8">
          How it works
        </h2>
        <ol className="border-t border-overlay/10">
          {STEPS.map((step) => (
            <li key={step.number} className="flex flex-col sm:flex-row gap-2 sm:gap-8 py-6 border-b border-overlay/10">
              <span className="font-mono text-sm font-semibold text-accent-cyan w-8 shrink-0 tnum">
                {step.number}
              </span>
              <div className="max-w-2xl">
                <h3 className="font-sans text-base font-semibold text-text-primary mb-1">
                  {step.title}
                </h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What you get, and the limits — two plain lists, no cards. */}
      <section className="max-w-7xl mx-auto px-6 pb-16 z-10 w-full">
        <div className="grid md:grid-cols-2 gap-12 border-t border-overlay/10 pt-12">
          <div>
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary mb-6">
              In the review workspace
            </h2>
            <ul className="space-y-3">
              {OUTCOMES.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                  <span aria-hidden="true" className="text-accent-cyan font-mono">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-mono text-sm font-semibold uppercase tracking-wider text-text-primary mb-6">
              Limits, stated plainly
            </h2>
            <ul className="space-y-3">
              {LIMITS.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                  <span aria-hidden="true" className="text-accent-cyan font-mono">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-overlay/5 py-6 text-center text-[10px] font-mono text-text-muted z-10">
        AUDITMIND v{APP_VERSION} — Contract risk review. AI output needs legal review.
      </footer>
    </div>
  );
}
