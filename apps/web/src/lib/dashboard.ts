import type { Contract } from '@auditmind/shared-types';

export type RiskBucket = 'critical' | 'high' | 'medium' | 'low';

/** Risk bucket matching the distribution chart thresholds. One function
 * serves the stat card, the chart and the list filter, so the three can
 * never drift apart again (round 6 fixed the card counting >= 70).
 * A missing or non-finite score is not a reviewed low risk — it is the
 * unreviewed placeholder, so it lands in Low like a 0, never anywhere
 * higher. */
export function riskBucket(score: number): RiskBucket {
  if (!Number.isFinite(score)) return 'low';
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

/** Whether a contract matches a risk-level list filter. An unreviewed
 * contract has no reviewed risk: its placeholder score of 0 would put it
 * in Low, so the filter must not list it under any level — only completed
 * analyses have a risk level to filter on. */
export function matchesRiskFilter(
  contract: Pick<Contract, 'status' | 'overallRiskScore'>,
  riskFilter: RiskBucket | 'all',
): boolean {
  if (riskFilter === 'all') return true;
  return contract.status === 'completed' && riskBucket(contract.overallRiskScore) === riskFilter;
}

export interface TrendPoint {
  name: string;
  /** Average risk of completed contracts that month, or null when none
   * finished that month. Null — not 0 — so the chart leaves a gap
   * instead of plotting "zero risk" for a month with no data. */
  avgRisk: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Average completed-contract risk per month for the last six months
 * (oldest first). Only completed contracts count: a processing contract
 * still carries its placeholder score of 0, which would drag the average
 * down, and a failed one has no review behind its score at all.
 * Contracts with a missing or unparseable date are skipped, never
 * silently filed under the current month. */
export function buildTrendData(
  contracts: Pick<Contract, 'status' | 'createdAt' | 'overallRiskScore'>[],
  now = new Date(),
): TrendPoint[] {
  const buckets: { name: string; year: number; monthIndex: number; sum: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ name: MONTHS[d.getMonth()], year: d.getFullYear(), monthIndex: d.getMonth(), sum: 0, count: 0 });
  }
  for (const contract of contracts) {
    if (contract.status !== 'completed' || !contract.createdAt) continue;
    const date = new Date(contract.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const bucket = buckets.find((b) => b.monthIndex === date.getMonth() && b.year === date.getFullYear());
    if (!bucket) continue;
    bucket.sum += contract.overallRiskScore || 0;
    bucket.count += 1;
  }
  return buckets.map((b) => ({
    name: b.name,
    avgRisk: b.count > 0 ? Math.round(b.sum / b.count) : null,
  }));
}

export type RiskCounts = Record<RiskBucket, number>;

/** Clause counts per risk bucket for the distribution chart. Completed
 * analyses only: every other status is unreviewed, so its score is a
 * placeholder, not a finding — a failed run must not land in High or
 * Critical just because it once carried a score. */
export function countByRiskBucket(
  contracts: Pick<Contract, 'status' | 'overallRiskScore'>[],
): RiskCounts {
  const counts: RiskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const contract of contracts) {
    if (contract.status !== 'completed') continue;
    counts[riskBucket(contract.overallRiskScore)] += 1;
  }
  return counts;
}

/** High-risk contracts among completed analyses only. The dashboard card
 * captions this count "of N analysed", so an unreviewed contract must
 * never count here: its placeholder score is 0 today, but the card must
 * not depend on that staying true if a score is ever set before review. */
export function countHighRiskCompleted(
  contracts: Pick<Contract, 'status' | 'overallRiskScore'>[],
): number {
  return contracts.filter(
    (contract) =>
      contract.status === 'completed' &&
      (riskBucket(contract.overallRiskScore) === 'high' ||
        riskBucket(contract.overallRiskScore) === 'critical'),
  ).length;
}
