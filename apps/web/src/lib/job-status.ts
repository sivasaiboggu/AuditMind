import type { Contract } from '@auditmind/shared-types';

export function jobStatusNotice(contract: Contract): string | null {
  const attempts = Math.max(0, Math.min(3, Math.floor(contract.processingAttempts || 0)));
  if (contract.processingError === 'RETRY_LIMIT_REACHED') {
    return `Automatic recovery stopped after ${attempts} attempts. The stored file needs operator review before retrying; do not upload a duplicate.`;
  }
  if (contract.processingError === 'STORAGE_RETRY_PENDING') {
    const retry = contract.nextRetryAt ? new Date(contract.nextRetryAt) : null;
    const time = retry && Number.isFinite(retry.getTime()) ? ` after ${retry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    return `File retrieval was interrupted. Attempt ${attempts} of 3; next automatic attempt${time}.`;
  }
  if (contract.processingError === 'ANALYSIS_INCOMPLETE') {
    return 'Analysis did not finish. No completed review is available. Check service configuration and the stored file before retrying.';
  }
  if (contract.status === 'processing' && attempts > 0) return `Processing attempt ${attempts} of 3.`;
  return null;
}
