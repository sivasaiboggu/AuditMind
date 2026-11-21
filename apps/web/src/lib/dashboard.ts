import type { Contract } from '@auditmind/shared-types';

export type RiskBucket = 'critical' | 'high' | 'medium' | 'low';

/** Risk bucket matching the distribution chart thresholds. One function
 * serves the stat card, the chart and the list filter, so the three can
 * never drift apart again (round 6 fixed the card counting >= 70). */
export function riskBucket(score: number): RiskBucket {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
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

/** Clause counts per risk bucket for the distribution chart. Low counts
 * completed contracts only: every other status still carries its
 * placeholder score of 0, which would otherwise inflate the Low bar
 * with contracts that were never reviewed. High and above cannot come
 * from a placeholder score, so they count any status. */
export function countByRiskBucket(
  contracts: Pick<Contract, 'status' | 'overallRiskScore'>[],
): RiskCounts {
  const counts: RiskCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const contract of contracts) {
    const bucket = riskBucket(contract.overallRiskScore);
    if (bucket === 'low' && contract.status !== 'completed') continue;
    counts[bucket] += 1;
  }
  return counts;
}
