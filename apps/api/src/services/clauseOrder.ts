/**
 * Natural ordering for clause numbers.
 *
 * Clause numbers are stored as text ("Section 4.2", "Section II",
 * "Preamble", "1.1"), and the database orders text lexicographically,
 * so "Section 10" used to sort before "Section 2" — and, worse, the
 * paginated clause endpoint sliced on that wrong order, so a clause
 * could move pages depending on its number. Sort in memory instead:
 * the parser caps a contract at 500 segments, so the full set is
 * bounded and cheap to order here.
 *
 * Rules, in order:
 *  - a clause with no number at all (the "Preamble" segment) comes first;
 *  - dotted Arabic numbers compare segment by segment, numerically
 *    ("2" < "2.1" < "10"), never as strings;
 *  - Roman numerals ("II", "IV") compare by value, and mix with Arabic
 *    by that same value;
 *  - anything unparseable falls back to a numeric-aware string
 *    comparison, and ties keep their original (document) order.
 */
export function compareClauseNumbers(a: string, b: string): number {
  const tokenA = clauseToken(a);
  const tokenB = clauseToken(b);
  const valueA = tokenValue(tokenA);
  const valueB = tokenValue(tokenB);
  if (valueA === null && valueB === null) {
    return new Intl.Collator(undefined, { numeric: true }).compare(a, b);
  }
  if (valueA === null) return -1;
  if (valueB === null) return 1;
  const segmentsA = valueA.segments;
  const segmentsB = valueB.segments;
  for (let i = 0; i < Math.max(segmentsA.length, segmentsB.length); i++) {
    const left = segmentsA[i] ?? 0;
    const right = segmentsB[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

/** Sort clauses by their `number` without mutating the input array. */
export function sortClausesByNumber<T extends { number: string }>(clauses: T[]): T[] {
  return clauses
    .map((clause, index) => ({ clause, index }))
    .sort((x, y) => compareClauseNumbers(x.clause.number, y.clause.number) || x.index - y.index)
    .map(({ clause }) => clause);
}

const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToInt(token: string): number | null {
  if (!/^[IVXLCDM]+$/.test(token)) return null;
  let total = 0;
  for (let i = 0; i < token.length; i++) {
    const current = ROMAN_VALUES[token[i]];
    const next = ROMAN_VALUES[token[i + 1]] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

/** The number part of a clause label: "Section 4.2" -> "4.2", "Preamble" -> "".
 * The column is nullable and the commit check does not require it, so a
 * stored row with no number must sort as unnumbered — not throw and take
 * the whole clause list down with it. */
function clauseToken(label: string): string {
  if (typeof label !== 'string') return '';
  const match = /^(?:section|article|clause)\s+([0-9]+(?:\.[0-9]+)*|[IVXLCDM]+)\b/i.exec(label.trim());
  if (match) return match[1];
  const bare = /^([0-9]+(?:\.[0-9]+)*|[IVXLCDM]+)\b/.exec(label.trim());
  return bare ? bare[1] : '';
}

function tokenValue(token: string): { segments: number[] } | null {
  if (!token) return null;
  if (/^[0-9]/.test(token)) {
    return { segments: token.split('.').map(Number) };
  }
  const roman = romanToInt(token.toUpperCase());
  return roman === null ? null : { segments: [roman] };
}
