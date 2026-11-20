import type { Clause, Contract, RiskLevel } from '@auditmind/shared-types';

const RISK_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

/** Count clauses per risk level, in critical-first order. */
export function countByRisk(clauses: Clause[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const clause of clauses) {
    if (clause.riskLevel in counts) counts[clause.riskLevel] += 1;
  }
  return counts;
}

function clauseHeading(clause: Clause): string {
  const number = clause.number ? `${clause.number}: ` : '';
  return `## ${number}${clause.title}`;
}

/** File-safe name for the downloaded report, e.g. `auditmind-report-nda-2026-11-20.md`. */
export function reportFileName(contract: Contract, generatedAt = new Date()): string {
  const slug = contract.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'contract';
  const date = generatedAt.toISOString().slice(0, 10);
  return `auditmind-report-${slug}-${date}.md`;
}

/**
 * Build a plain-text Markdown risk report from the contract and its clauses.
 * Pure function: no network, no storage, no invented content — every line
 * comes from the contract record or the analysed clauses themselves.
 */
export function buildReportMarkdown(
  contract: Contract,
  clauses: Clause[],
  generatedAt = new Date(),
): string {
  const counts = countByRisk(clauses);
  const lines: string[] = [
    `# Contract Risk Report: ${contract.name}`,
    '',
    `Generated ${generatedAt.toISOString().slice(0, 10)} by AuditMind.`,
    '',
    `Overall risk score: ${contract.overallRiskScore} / 100`,
    '',
    '## Summary',
    '',
    `- Clauses analysed: ${clauses.length}`,
    ...RISK_ORDER.map(
      (level) => `- ${level[0].toUpperCase()}${level.slice(1)} risk: ${counts[level]}`,
    ),
    '',
  ];

  if (clauses.length === 0) {
    lines.push('No clause results are available for this contract.', '');
  } else {
    for (const clause of clauses) {
      lines.push(
        clauseHeading(clause),
        '',
        `Risk level: ${clause.riskLevel}`,
        '',
        clause.text,
        '',
        `Why it matters: ${clause.riskExplanation}`,
        '',
      );
      if (clause.suggestedRedline) {
        lines.push(`Suggested revision: ${clause.suggestedRedline}`, '');
      }
    }
  }

  lines.push(
    '---',
    '',
    'AI output needs legal review. This report is not legal advice.',
    '',
  );
  return lines.join('\n');
}
