import { useEffect } from 'react';

/**
 * Updates the document title dynamically.
 * Appends ' | AuditMind' to every page title for consistent branding.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | AuditMind` : 'AuditMind';
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
