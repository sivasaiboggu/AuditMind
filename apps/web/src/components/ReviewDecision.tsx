import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { REVIEW_OUTCOMES } from '@auditmind/shared-types';
import type { ClauseReview, ReviewOutcome } from '@auditmind/shared-types';
import { reviewLabels } from '../lib/review';
import { Button } from './ui';

interface Props {
  review?: ClauseReview;
  busy: boolean;
  save: (decision: { outcome: ReviewOutcome; note: string } | { outcome: null }) => Promise<void>;
}

export function ReviewDecision({ review, busy, save }: Props) {
  const [outcome, setOutcome] = useState<ReviewOutcome | ''>(review?.outcome ?? '');
  const [note, setNote] = useState(review?.note ?? '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const requiresNote = Boolean(outcome && outcome !== 'accepted');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outcome || busy) return;
    if (requiresNote && !note.trim()) {
      setError('Add a note explaining what needs to happen next.');
      return;
    }
    setError('');
    setStatus('');
    try {
      await save({ outcome, note: note.trim() });
      setStatus('Decision saved.');
    } catch {
      setError('Could not save the decision. Try again.');
    }
  }

  async function reopen() {
    setError('');
    setStatus('');
    try {
      await save({ outcome: null });
      setOutcome('');
      setNote('');
      setStatus('Clause reopened.');
      document.getElementById('decision-outcome')?.focus();
    } catch {
      setError('Could not reopen this clause. Try again.');
    }
  }

  return (
    <section className="decision-panel" aria-labelledby="decision-title">
      <div className="decision-header">
        <h3 id="decision-title">Review decision</h3>
        {review && <span className="decision-saved"><Check size={14} aria-hidden="true" /> {reviewLabels[review.outcome]}</span>}
      </div>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="grid gap-1">
          <label htmlFor="decision-outcome" className="text-sm font-semibold">Decision</label>
          <select id="decision-outcome" className="field" value={outcome} required disabled={busy}
            onChange={(event) => { setOutcome(event.target.value as ReviewOutcome | ''); setError(''); }}>
            <option value="">Choose a decision</option>
            {REVIEW_OUTCOMES.map((value) => <option key={value} value={value}>{reviewLabels[value]}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="decision-note" className="text-sm font-semibold">Reviewer note <span className="font-normal text-text-muted">({requiresNote ? 'required' : 'optional'})</span></label>
          <textarea id="decision-note" className="field decision-note" rows={3} maxLength={1000} required={requiresNote}
            disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={!outcome || busy}>Save decision</Button>
          {review && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void reopen()}><RotateCcw size={14} aria-hidden="true" /> Reopen</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-risk-critical">{error}</p>}
        <p role="status" className="decision-status text-sm text-text-secondary">{busy ? 'Saving…' : status}</p>
      </form>
    </section>
  );
}
