import { test } from 'node:test';
import assert from 'node:assert/strict';
// This process is intentionally offline; never read a developer key for this suite.
delete process.env.GEMINI_API_KEY;
const { validateContractHeuristic } = await import('../dist/services/gemini.js');

test('contract heuristic does not count keywords hidden inside other words', () => {
  // "marshall" contains "shall", "partying" contains "party" — neither is
  // the legal word, so a short note like this is not a contract.
  const result = validateContractHeuristic(
    'The marshalling yard schedule and the partying crowd filled the long-term plan for the weekend.',
  );
  assert.equal(result.isContract, false);
});

test('contract heuristic still matches the real legal words', () => {
  const result = validateContractHeuristic(
    'This agreement sets out the terms. The parties shall comply with the governing law.',
  );
  assert.equal(result.isContract, true);
});

test('contract heuristic matches multi-word phrases on word boundaries', () => {
  assert.equal(
    validateContractHeuristic('The effective date of this agreement is 1 January 2026.').isContract,
    true,
  );
});

test('contract heuristic rejects a short note with no legal words', () => {
  const result = validateContractHeuristic('Hello world, a short note about lunch.');
  assert.equal(result.isContract, false);
  assert.match(result.message, /does not appear to be a legal contract/);
});

test('contract heuristic keeps the long-document leniency for keyword-free text', () => {
  const result = validateContractHeuristic('A long report. '.repeat(60));
  assert.equal(result.isContract, true);
});
