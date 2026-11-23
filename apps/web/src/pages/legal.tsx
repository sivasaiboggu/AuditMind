import { Link } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/SiteHeader';

const privacySections = [
  ['Account and workspace', 'Configured installations use Supabase for authentication, file storage and workspace records. Your sign-in email identifies your account. This browser stores your session and theme preference.'],
  ['Files and analysis', 'AuditMind processes your uploaded file and saves extracted clauses, findings and any review decisions and notes with the contract. When Gemini is configured, relevant clause text and questions are sent to that service to produce explanations or answers.'],
  ['Removing data', 'Use Delete in the contract list to remove a contract, its analysis and your saved decisions from the workspace. For account access, retention and any backups, contact the operator of the installation you use.'],
];

const termsSections = [
  ['Use files you can share', 'Upload contracts only if you have permission to process them in the installation you use. Follow your organization’s rules for confidential or regulated information.'],
  ['Review the underlying agreement', 'AuditMind provides review priorities, explanations and suggested language. Have a qualified reviewer check the original agreement before you rely on a finding or adopt a revision.'],
  ['Software license', 'AuditMind’s source code is distributed under the MIT License. Your installation operator may provide additional terms for the hosted service.'],
];

export default function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const isPrivacy = kind === 'privacy';
  return (
    <div className="public-shell">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="frame page-stack entry-layout">
        <div className="entry-lead">
          <h1 className="page-title">{isPrivacy ? 'Privacy' : 'Terms of use'}</h1>
          <Link to="/" className="text-link text-text-secondary">Back to AuditMind</Link>
        </div>
        <div>
          {(isPrivacy ? privacySections : termsSections).map(([title, text]) => (
            <section className="border-t border-rule py-6" key={title}>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="reading mt-2 text-text-secondary">{text}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
