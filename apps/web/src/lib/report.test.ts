import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Clause, Contract } from '@auditmind/shared-types';
import { buildReportMarkdown, countByRisk, reportFileName } from './report';

const contract: Contract = {
  id: 'c1',
  userId: 'u1',
  name: 'Master Services Agreement',
  filePath: '/tmp/msa.pdf',
  status: 'completed',
  overallRiskScore: 72,
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

const clause = (overrides: Partial<Clause>): Clause => ({
  id: 'cl-1',
  contractId: 'c1',
  number: 'Section 4.2',
  title: 'Indemnification',
  text: 'The client shall indemnify the provider without limit.',
  riskLevel: 'critical',
  riskExplanation: 'Unlimited liability is unusual and risky.',
  suggestedRedline: 'Cap liability at the fees paid in the last 12 months.',
  ...overrides,
});

describe('countByRisk', () => {
  it('counts each level and defaults missing levels to zero', () => {
    assert.deepEqual(
      countByRisk([
        clause({}),
        clause({ id: 'cl-2', riskLevel: 'high' }),
        clause({ id: 'cl-3', riskLevel: 'high' }),
      ]),
      { critical: 1, high: 2, medium: 0, low: 0 },
    );
  });

  it('is empty for no clauses', () => {
    assert.deepEqual(countByRisk([]), { critical: 0, high: 0, medium: 0, low: 0 });
  });

  it('ignores unexpected risk levels instead of corrupting the counts', () => {
    // Rows arrive from the API: a level outside the four known ones must
    // be skipped. On a plain object, `counts["toString"] += 1` coerces
    // the inherited function to a string and stores garbage in the counts.
    assert.deepEqual(
      countByRisk([
        clause({}),
        clause({ id: 'cl-2', riskLevel: 'toString' as RiskLevel }),
        clause({ id: 'cl-3', riskLevel: 'constructor' as RiskLevel }),
        clause({ id: 'cl-4', riskLevel: '__proto__' as RiskLevel }),
      ]),
      { critical: 1, high: 0, medium: 0, low: 0 },
    );
  });
});

describe('reportFileName', () => {
  it('slugifies the contract name and stamps the date', () => {
    assert.equal(
      reportFileName(contract, new Date('2026-11-20T10:00:00.000Z')),
      'auditmind-report-master-services-agreement-2026-11-20.md',
    );
  });
});

describe('buildReportMarkdown', () => {
  it('includes the contract name, score, counts and every clause verbatim', () => {
    const md = buildReportMarkdown(contract, [
      clause({}),
      clause({ id: 'cl-2', number: '1.1', title: 'Term', riskLevel: 'low',
        text: 'This agreement lasts 12 months.', riskExplanation: 'Standard term.',
        suggestedRedline: undefined }),
    ]);
    assert.match(md, /# Contract Risk Report: Master Services Agreement/);
    assert.match(md, /Overall risk score: 72 \/ 100/);
    assert.match(md, /- Critical risk: 1/);
    assert.match(md, /- Low risk: 1/);
    assert.match(md, /## Section 4\.2: Indemnification/);
    assert.match(md, /The client shall indemnify the provider without limit\./);
    assert.match(md, /Why it matters: Unlimited liability is unusual and risky\./);
    assert.match(md, /Suggested revision: Cap liability at the fees paid in the last 12 months\./);
    assert.match(md, /## 1\.1: Term/);
    assert.match(md, /AI output needs legal review/);
  });

  it('omits the revision line when a clause has no redline', () => {
    const md = buildReportMarkdown(contract, [
      clause({ suggestedRedline: undefined }),
    ]);
    assert.doesNotMatch(md, /Suggested revision:/);
  });

  it('lists the matched words that earned the tier, and omits the line when none were stored', () => {
    const md = buildReportMarkdown(contract, [
      clause({ matchedTerms: ['indemnify', 'negligence'] }),
      clause({ id: 'cl-2', matchedTerms: undefined }),
    ]);
    assert.match(md, /Matched words: indemnify, negligence/);
    assert.equal(md.match(/Matched words:/g)?.length, 1);
  });

  it('states plainly when there are no clauses', () => {
    const md = buildReportMarkdown(contract, []);
    assert.match(md, /No clause results are available for this contract\./);
    assert.match(md, /Clauses analysed: 0/);
  });

  it('does not invent content: every clause line comes from the input', () => {
    const md = buildReportMarkdown(contract, [clause({})]);
    assert.doesNotMatch(md, /AI-?generated|recommended|negotiate/i);
  });

  it('does not let an unexpected risk level corrupt the summary counts', () => {
    const md = buildReportMarkdown(contract, [
      clause({ riskLevel: 'toString' as RiskLevel }),
    ]);
    assert.match(md, /- Critical risk: 0/);
    assert.match(md, /- High risk: 0/);
    assert.doesNotMatch(md, /function toString/);
  });
});
