import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Contract } from '@auditmind/shared-types';
import { buildTrendData, countByRiskBucket, countHighRiskCompleted, matchesRiskFilter, riskBucket } from './dashboard';

const contract = (
  overrides: Partial<Pick<Contract, 'status' | 'createdAt' | 'overallRiskScore'>>,
): Pick<Contract, 'status' | 'createdAt' | 'overallRiskScore'> => ({
  status: 'completed',
  createdAt: '2026-11-20T00:00:00.000Z',
  overallRiskScore: 50,
  ...overrides,
});

describe('riskBucket', () => {
  it('uses the same thresholds as the distribution chart', () => {
    assert.equal(riskBucket(100), 'critical');
    assert.equal(riskBucket(75), 'critical');
    assert.equal(riskBucket(74), 'high');
    assert.equal(riskBucket(50), 'high');
    assert.equal(riskBucket(49), 'medium');
    assert.equal(riskBucket(25), 'medium');
    assert.equal(riskBucket(24), 'low');
    assert.equal(riskBucket(0), 'low');
  });

  it('treats a missing or non-finite score as the unreviewed placeholder, never as a real tier', () => {
    assert.equal(riskBucket(Number.NaN), 'low');
    assert.equal(riskBucket(Number.POSITIVE_INFINITY), 'low');
  });
});

describe('buildTrendData', () => {
  // Fixed "now" so month buckets are deterministic.
  const now = new Date(2026, 10, 21); // 21 Nov 2026

  it('averages completed contracts per month over the last six months', () => {
    const points = buildTrendData(
      [
        contract({ createdAt: '2026-11-05T00:00:00.000Z', overallRiskScore: 80 }),
        contract({ createdAt: '2026-11-15T00:00:00.000Z', overallRiskScore: 60 }),
        contract({ createdAt: '2026-10-02T00:00:00.000Z', overallRiskScore: 30 }),
      ],
      now,
    );
    assert.deepEqual(points.map((p) => p.name), ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    assert.equal(points[4].avgRisk, 30);
    assert.equal(points[5].avgRisk, 70);
  });

  it('leaves a null gap for months with no completed contracts instead of plotting zero risk', () => {
    const points = buildTrendData(
      [contract({ createdAt: '2026-11-05T00:00:00.000Z', overallRiskScore: 80 })],
      now,
    );
    assert.deepEqual(
      points.map((p) => p.avgRisk),
      [null, null, null, null, null, 80],
    );
  });

  it('excludes processing and failed contracts, whose scores are placeholders', () => {
    const points = buildTrendData(
      [
        contract({ status: 'processing', createdAt: '2026-11-05T00:00:00.000Z', overallRiskScore: 0 }),
        contract({ status: 'failed', createdAt: '2026-11-05T00:00:00.000Z', overallRiskScore: 0 }),
      ],
      now,
    );
    assert.deepEqual(points.map((p) => p.avgRisk), [null, null, null, null, null, null]);
  });

  it('skips contracts with a missing or unparseable date instead of filing them under the current month', () => {
    const points = buildTrendData(
      [
        contract({ createdAt: 'not-a-date', overallRiskScore: 90 }),
        contract({ createdAt: '', overallRiskScore: 90 }),
      ],
      now,
    );
    assert.deepEqual(points.map((p) => p.avgRisk), [null, null, null, null, null, null]);
  });

  it('buckets across the year boundary', () => {
    const january = new Date(2027, 0, 15);
    const points = buildTrendData(
      [contract({ createdAt: '2026-12-20T00:00:00.000Z', overallRiskScore: 40 })],
      january,
    );
    assert.deepEqual(points.map((p) => p.name), ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan']);
    assert.equal(points[4].avgRisk, 40);
    assert.equal(points[5].avgRisk, null);
  });
});

describe('countHighRiskCompleted', () => {
  it('counts completed high and critical contracts, matching the card caption "of N analysed"', () => {
    assert.equal(
      countHighRiskCompleted([
        contract({ overallRiskScore: 90 }),
        contract({ overallRiskScore: 60 }),
        contract({ overallRiskScore: 30 }),
        contract({ overallRiskScore: 10 }),
      ]),
      2,
    );
  });

  it('never counts an unreviewed contract, even one carrying a high score', () => {
    assert.equal(
      countHighRiskCompleted([
        contract({ status: 'processing', overallRiskScore: 90 }),
        contract({ status: 'failed', overallRiskScore: 80 }),
        contract({ status: 'processing', overallRiskScore: 0 }),
      ]),
      0,
    );
  });
});

describe('countByRiskBucket', () => {
  it('counts each bucket and keeps unreviewed contracts out of Low', () => {
    assert.deepEqual(
      countByRiskBucket([
        contract({ overallRiskScore: 90 }),
        contract({ overallRiskScore: 60 }),
        contract({ overallRiskScore: 30 }),
        contract({ overallRiskScore: 10 }),
        // A processing contract still carries its placeholder score of 0:
        // it must not inflate the Low bar.
        contract({ status: 'processing', overallRiskScore: 0 }),
        contract({ status: 'failed', overallRiskScore: 0 }),
      ]),
      { critical: 1, high: 1, medium: 1, low: 1 },
    );
  });

  it('never counts an unreviewed contract in any bucket, even one carrying a high score', () => {
    assert.deepEqual(
      countByRiskBucket([
        contract({ status: 'processing', overallRiskScore: 90 }),
        contract({ status: 'failed', overallRiskScore: 80 }),
        contract({ status: 'processing', overallRiskScore: 40 }),
      ]),
      { critical: 0, high: 0, medium: 0, low: 0 },
    );
  });
});

describe('matchesRiskFilter', () => {
  it('matches a completed contract in its own bucket and nothing else', () => {
    assert.equal(matchesRiskFilter(contract({ overallRiskScore: 80 }), 'critical'), true);
    assert.equal(matchesRiskFilter(contract({ overallRiskScore: 80 }), 'high'), false);
    assert.equal(matchesRiskFilter(contract({ overallRiskScore: 80 }), 'all'), true);
  });

  it('never matches an unreviewed contract under any risk level', () => {
    // A processing contract's placeholder score of 0 used to list it
    // under Low, as if it had been reviewed and found safe.
    assert.equal(matchesRiskFilter(contract({ status: 'processing', overallRiskScore: 0 }), 'low'), false);
    assert.equal(matchesRiskFilter(contract({ status: 'processing', overallRiskScore: 90 }), 'critical'), false);
    assert.equal(matchesRiskFilter(contract({ status: 'failed', overallRiskScore: 60 }), 'high'), false);
    assert.equal(matchesRiskFilter(contract({ status: 'processing', overallRiskScore: 0 }), 'all'), true);
  });
});
