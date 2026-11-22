/**
 * The evidence line: the exact words that earned a clause its risk tier.
 *
 * The pipeline stores the matched words with the clause (see
 * `Clause.matchedTerms`); this module only decides how they are shown.
 * Matching is case-insensitive and whole-word, so "indemnify" highlights
 * inside "shall indemnify the other party" but never inside a longer word,
 * and a two-word term such as "liquidated damages" wins over either word
 * alone. Terms arrive lowercased from the server; the original clause text
 * keeps its own casing in the output.
 */

export interface TextSegment {
  text: string;
  matched: boolean;
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split clause text into plain and matched segments for highlighting. */
export function splitByMatchedTerms(text: string, terms: string[]): TextSegment[] {
  const clean = [...new Set((terms ?? []).map((t) => t.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!text || clean.length === 0) return [{ text, matched: false }];
  // The negative lookbehind mirrors the server rule: a word preceded by
  // "non-" or "non " is the negation of the term, not the term itself, so
  // "confidential" never highlights inside "non-confidential".
  const pattern = new RegExp(`(?<!non[-\\s])\\b(${clean.map(escapeRegExp).join('|')})\\b`, 'gi');
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), matched: false });
    segments.push({ text: match[0], matched: true });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), matched: false });
  return segments.filter((s) => s.text !== '');
}

/** One mono line for the evidence strip: "indemnify · negligence". */
export function formatMatchedTerms(terms: string[] | undefined): string {
  if (!terms || terms.length === 0) return '';
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))].join(' · ');
}
