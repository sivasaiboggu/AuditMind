export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function riskLevelToColorClass(level: string): string {
  switch (level?.toLowerCase()) {
    case 'critical': return 'text-risk-critical bg-risk-critical/10 border-risk-critical/30';
    case 'high':     return 'text-risk-high bg-risk-high/10 border-risk-high/30';
    case 'medium':   return 'text-risk-medium bg-risk-medium/10 border-risk-medium/30';
    case 'low':      return 'text-risk-low bg-risk-low/10 border-risk-low/30';
    default:         return 'text-text-muted bg-white/5 border-white/10';
  }
}

export function getInitials(name: string): string {
  if (!name) return '';
  return name
    .split(' ')
    .map(part => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}
