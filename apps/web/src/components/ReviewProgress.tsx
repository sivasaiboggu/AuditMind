import type { CSSProperties } from 'react';

export function ReviewProgress({ decided, total }: { decided: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="decision-progress">
      <span className="decision-progress-track" aria-hidden="true">
        <span style={{ '--progress': Math.min(decided / total, 1) } as CSSProperties} />
      </span>
      <span className="decision-progress-count">{decided} of {total} decided</span>
    </div>
  );
}
