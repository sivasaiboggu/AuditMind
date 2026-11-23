import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, FileText } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/SiteHeader';
import { Badge } from '../components/ui';
import { useAuth } from '../lib/auth-context';
import { splitByMatchedTerms } from '../lib/evidence';

const samples = [
  {
    title: 'Limitation of liability',
    section: 'Section 5',
    risk: 'critical',
    text: 'Neither party’s total liability shall exceed the fees paid under this agreement, except for breaches of confidentiality, which carry unlimited liability.',
    terms: ['unlimited liability', 'confidentiality'],
    explanation: 'The exception takes confidentiality breaches outside the liability cap.',
  },
  {
    title: 'Governing law',
    section: 'Section 4',
    risk: 'high',
    text: 'This agreement is governed by the laws of the State of Delaware, and the parties submit to the exclusive jurisdiction of its courts.',
    terms: ['exclusive jurisdiction'],
    explanation: 'A dispute would have to be heard in Delaware, even if both parties operate elsewhere.',
  },
] as const;

const steps = [
  ['Upload an agreement', 'Choose a PDF, DOCX or TXT file up to 15 MB. Scans need OCR before upload.'],
  ['Read the findings', 'Check the original text, matched wording and proposed revisions where available. Compare two clauses when you need to see them together.'],
  ['Record your decisions', 'Accept a clause as written, request a revision or escalate it with a note. Export a Markdown report for your review.'],
];

export default function Landing() {
  const { user, loading } = useAuth();
  const [sampleIndex, setSampleIndex] = useState(0);
  const sample = samples[sampleIndex];

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <>
      <SiteHeader signIn />
      <main id="main-content" tabIndex={-1}>
        <section className="frame landing-masthead">
          <h1 className="display-lg">Read the contract.<br />Decide what changes.</h1>
          <div className="landing-intro">
            <p className="lede">AuditMind pulls out contract clauses, shows what raised each flag, and keeps your decisions with the agreement.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/login" className="action action-primary">Start a review <ArrowUpRight size={17} aria-hidden="true" /></Link>
              <a href="#how-it-works" className="action action-ghost">How it works <ArrowDown size={15} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="frame landing-demo" aria-labelledby="sample-title">
          <div className="sample-file">
            <div className="sample-file-header">
              <FileText size={18} aria-hidden="true" />
              <h2 id="sample-title">Sample mutual NDA</h2>
            </div>
            <div className="sample-tabs" role="group" aria-label="Sample findings">
              {samples.map(({ title, section }, index) => (
                <button key={title} type="button" aria-pressed={sampleIndex === index} onClick={() => setSampleIndex(index)}>
                  <span className="eyebrow">{section}</span>
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sample-reading" key={sample.section}>
            <div className="sample-paper grain">
              <p className="eyebrow">Original clause</p>
              <h3 className="section-title">{sample.title}</h3>
              <blockquote className="reading">
                {splitByMatchedTerms(sample.text, [...sample.terms]).map((segment, index) =>
                  segment.matched ? <strong key={index} className="evidence-mark">{segment.text}</strong> : segment.text,
                )}
              </blockquote>
            </div>
            <div className="sample-evidence">
              <Badge tone={sample.risk} className="capitalize">{sample.risk} risk</Badge>
              <h3>Why it was flagged</h3>
              <p className="reading text-text-secondary">{sample.explanation}</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="frame editorial-section">
          <h2 className="section-title">From upload to decision</h2>
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
          <p className="reading text-text-secondary">Use findings to decide what to read first. Ask a qualified legal reviewer to check the agreement and any suggested changes.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
