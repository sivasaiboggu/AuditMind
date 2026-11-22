import { Link, Navigate } from 'react-router-dom';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/SiteHeader';
import { Badge } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { formatMatchedTerms, splitByMatchedTerms } from '../lib/evidence';

const sample = {
  title: 'Limitation of liability',
  text: 'Neither party’s total liability shall exceed the fees paid under this agreement, except for breaches of confidentiality, which carry unlimited liability.',
  matchedTerms: ['unlimited liability', 'confidentiality'],
  explanation: 'The exception leaves confidentiality breaches outside the liability cap.',
};

const steps = [
  ['Upload a contract', 'Choose a PDF, DOCX or TXT file up to 15 MB. AuditMind extracts the text and splits it into clauses.'],
  ['Read the findings', 'Review rules score each clause. Open a finding to see the matched words, why they matter, and a suggested revision where available.'],
  ['Check the source', 'Compare two clauses, ask a question about the contract, or export a Markdown report for your review.'],
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <SiteHeader signIn />
      <main id="main-content" tabIndex={-1}>
        <section className="frame landing-hero">
          <div className="landing-lead">
            <p className="eyebrow">Contract risk review</p>
            <h1 className="display-lg">Read the<br />risk in<br />the fine print.</h1>
            <p className="lede">See which clauses need a closer look, what raised the flag, and where it appears in the contract.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/login" className="action action-primary">Start a review <ArrowUpRight size={18} aria-hidden="true" /></Link>
              <a href="#how-it-works" className="action action-ghost">How it works <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
          </div>

          <figure className="dark sample-sheet grain" aria-labelledby="sample-title">
            <div className="meta-rule">
              <span className="eyebrow">Sample finding</span>
              <span className="eyebrow">Mutual NDA</span>
            </div>
            <div className="sample-inner">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">Section 5</p>
                <Badge tone="critical">Critical risk</Badge>
              </div>
              <h2 id="sample-title" className="section-title mt-3">{sample.title}</h2>
              <blockquote className="margin-note sample-quote reading mt-6 text-text-secondary">
                {splitByMatchedTerms(sample.text, sample.matchedTerms).map((segment, index) =>
                  segment.matched
                    ? <strong key={index} className="font-semibold text-text-primary underline decoration-accent-brand decoration-2 underline-offset-4">{segment.text}</strong>
                    : segment.text,
                )}
              </blockquote>
              <div className="sample-note">
                <div className="sample-score"><span>82</span><span className="eyebrow"> / 100</span></div>
                <div>
                  <p className="eyebrow">Why it matters</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">{sample.explanation}</p>
                </div>
              </div>
            </div>
            <figcaption className="sample-caption text-sm text-text-muted">Matched words · {formatMatchedTerms(sample.matchedTerms)}</figcaption>
          </figure>
        </section>

        <section id="how-it-works" className="frame editorial-section">
          <h2 className="section-title">From upload to review</h2>
          <ol className="step-list">
            {steps.map(([title, description], index) => (
              <li key={title}>
                <span className="eyebrow" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
                  <p className="reading mt-1 text-text-secondary">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="frame editorial-section last-editorial">
          <h2 className="section-title">Before you rely on a finding</h2>
          <div className="margin-note space-y-3">
            <p className="reading text-text-secondary">Use findings to decide what to read first. Ask a qualified legal reviewer to check the agreement and any suggested changes.</p>
            <p className="reading text-text-secondary">Scans need OCR before upload. Completed clause explanations require the configured AI service. Chat can show a limited local search result if the service is unavailable. References depend on the source corpus your operator has configured.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
