import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareClauseNumbers, sortClausesByNumber} from '../dist/services/clauseOrder.js';

test('dotted numbers order numerically, not lexicographically', () => {
  const input = ['Section 10', 'Section 2', 'Section 1', 'Section 2.1', 'Section 2.10', 'Section 2.2'];
  assert.deepEqual(input.sort(compareClauseNumbers),
    ['Section 1', 'Section 2', 'Section 2.1', 'Section 2.2', 'Section 2.10', 'Section 10']);
});

test('the unnumbered preamble sorts first and ties keep document order', () => {
  const clauses = [
    {number: 'Section 2', title: 'B'},
    {number: 'Preamble', title: 'Intro'},
    {number: 'Section 1', title: 'A'},
    {number: 'Section 1', title: 'A again'},
  ];
  assert.deepEqual(sortClausesByNumber(clauses).map(c => c.title),
    ['Intro', 'A', 'A again', 'B']);
});

test('roman numerals order by value and mix with arabic by value', () => {
  const input = ['Section X', 'Section II', 'Section 1', 'Section IV', 'Section 9'];
  assert.deepEqual(input.sort(compareClauseNumbers),
    ['Section 1', 'Section II', 'Section IV', 'Section 9', 'Section X']);
});

test('bare numbers and article labels order the same way', () => {
  assert.deepEqual(['10.5', '2', '1.1'].sort(compareClauseNumbers), ['1.1', '2', '10.5']);
  assert.deepEqual(['Article 10', 'Article 3'].sort(compareClauseNumbers), ['Article 3', 'Article 10']);
});

test('sorting does not mutate the input array', () => {
  const clauses = [{number: 'Section 2'}, {number: 'Section 1'}];
  sortClausesByNumber(clauses);
  assert.deepEqual(clauses.map(c => c.number), ['Section 2', 'Section 1']);
});
