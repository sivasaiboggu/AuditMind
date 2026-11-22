import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitByMatchedTerms, formatMatchedTerms } from './evidence.js';

describe('evidence highlighting', () => {
  it('splits clause text into plain and matched segments', () => {
    assert.deepEqual(
      splitByMatchedTerms('Each party shall indemnify the other for negligence.', ['indemnify', 'negligence']),
      [
        { text: 'Each party shall ', matched: false },
        { text: 'indemnify', matched: true },
        { text: ' the other for ', matched: false },
        { text: 'negligence', matched: true },
        { text: '.', matched: false },
      ],
    );
  });

  it('matches case-insensitively and keeps the original casing', () => {
    const [first, second] = splitByMatchedTerms('LIQUIDATED DAMAGES APPLY', ['liquidated damages']);
    assert.deepEqual(first, { text: 'LIQUIDATED DAMAGES', matched: true });
    assert.deepEqual(second, { text: ' APPLY', matched: false });
  });

  it('never highlights a term inside a longer word', () => {
    assert.deepEqual(
      splitByMatchedTerms('the determination of fees may change', ['terminate']),
      [{ text: 'the determination of fees may change', matched: false }],
    );
    assert.deepEqual(
      splitByMatchedTerms('all information is non-confidential here', ['confidential']),
      [{ text: 'all information is non-confidential here', matched: false }],
    );
  });

  it('prefers the longer phrase over either word alone', () => {
    assert.deepEqual(
      splitByMatchedTerms('liquidated damages apply', ['damages', 'liquidated damages']),
      [
        { text: 'liquidated damages', matched: true },
        { text: ' apply', matched: false },
      ],
    );
  });

  it('returns the whole text unmarked when nothing matches', () => {
    assert.deepEqual(splitByMatchedTerms('ordinary delivery clause', []), [
      { text: 'ordinary delivery clause', matched: false },
    ]);
    assert.deepEqual(splitByMatchedTerms('ordinary delivery clause', ['indemnify']), [
      { text: 'ordinary delivery clause', matched: false },
    ]);
  });

  it('formats the evidence line with middots and no duplicates', () => {
    assert.equal(formatMatchedTerms(['indemnify', 'negligence']), 'indemnify · negligence');
    assert.equal(formatMatchedTerms(['indemnify', 'indemnify']), 'indemnify');
    assert.equal(formatMatchedTerms([]), '');
    assert.equal(formatMatchedTerms(undefined), '');
  });
});
