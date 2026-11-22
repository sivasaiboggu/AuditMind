import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import * as z from 'zod/mini';
import { SiteFooter, SiteHeader } from '../components/SiteHeader';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';

const emailSchema = z.pipe(z.string().check(z.trim()), z.email({ error: 'Enter a valid email address.' }));
const codeSchema = z.string().check(z.trim(), z.regex(/^\d{6}$/, 'Enter the six-digit code from your email.'));

export default function Login() {
  const { user, loading: authLoading, loginWithGoogle, sendOTP, verifyOTP, loginBypass } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (verify) codeInput.current?.focus(); }, [verify]);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = z.safeParse(verify ? codeSchema : emailSchema, verify ? code : email);
    if (!value.success) {
      setInvalid(true);
      setError(value.error.issues[0].message);
      return;
    }
    setError('');
    setInvalid(false);
    setBusy(true);
    try {
      if (verify) await verifyOTP(email, value.data);
      else {
        await sendOTP(value.data);
        setEmail(value.data);
        setVerify(true);
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : verify ? 'Could not verify the code. Try again.' : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function startSignIn() {
    setBusy(true);
    setError('');
    try {
      if (supabase) await loginWithGoogle();
      else await loginBypass(email.trim() || 'demo.analyst@auditmind.local');
    } catch {
      setError(supabase ? 'Google sign-in could not start. Try the email option.' : 'The demo could not open. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function resetError() {
    setInvalid(false);
    setError('');
  }

  return (
    <div className="public-shell">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="frame page-stack entry-layout">
        <section className="entry-lead">
          <h1 className="page-title">Sign in to<br className="hidden sm:block" /> AuditMind</h1>
          <p className="lede">Open your contracts, pick up a clause review, or start with a new file.</p>
          <aside className="margin-note reading text-text-secondary">
            <p className="font-semibold text-text-primary">Review starts with the source.</p>
            <p>Have a PDF, DOCX or TXT file ready. Scanned PDFs need readable text.</p>
          </aside>
        </section>

        <section className="entry-form sheet" aria-labelledby="sign-in-method">
          <h2 id="sign-in-method" className="section-title">{supabase ? (verify ? 'Check your email' : 'Sign in with email') : 'Open the local demo'}</h2>
          <p className="reading mt-3 text-text-secondary">
            {supabase ? (verify ? <>We sent a six-digit code to <strong>{email}</strong>.</> : 'We’ll send a one-time code to your email address.') : 'This installation has demo access. Connect an authentication provider to review and save your own contracts.'}
          </p>
          {supabase && (
            <form className="mt-6 grid gap-4" onSubmit={submit} noValidate>
              {verify ? (
                <div className="grid gap-2">
                  <label htmlFor="otp">Verification code</label>
                  <input id="otp" ref={codeInput} className="field font-mono" type="text" inputMode="numeric" autoComplete="one-time-code"
                    maxLength={6} value={code} required aria-invalid={invalid} aria-describedby={invalid ? 'sign-in-error' : undefined}
                    onChange={(event) => { setCode(event.target.value); resetError(); }} />
                </div>
              ) : (
                <div className="grid gap-2">
                  <label htmlFor="email">Email address</label>
                  <input id="email" className="field" type="email" autoComplete="email" value={email} placeholder="name@example.com"
                    required aria-invalid={invalid} aria-describedby={invalid ? 'sign-in-error' : undefined}
                    onChange={(event) => { setEmail(event.target.value); resetError(); }} />
                </div>
              )}
              <button type="submit" disabled={busy} className="action action-primary">
                {busy ? (verify ? 'Checking code…' : 'Sending code…') : (verify ? 'Verify and sign in' : 'Send sign-in code')}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
              {verify && <button type="button" disabled={busy} className="text-link justify-self-start py-2" onClick={() => { setVerify(false); setCode(''); resetError(); }}>Use a different email</button>}
            </form>
          )}
          {error && <p id="sign-in-error" role="alert" className="margin-note mt-4 text-sm text-risk-critical [--note-ink:var(--risk-critical)]">{error}</p>}
          <div className={supabase ? 'mt-6 border-t border-rule pt-6' : 'mt-6'}>
            <button type="button" disabled={busy} className={`action w-full ${supabase ? 'action-outline' : 'action-primary'}`} onClick={() => void startSignIn()}>
              {supabase ? 'Continue with Google' : 'Continue with a demo account'} <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-6 text-sm text-text-muted"><Link to="/privacy" className="text-link">How we handle your data</Link></p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
