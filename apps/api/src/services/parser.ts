import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface RawSegment {
  number: string;
  title: string;
  text: string;
}

/** Multipart already caps uploads at 15 MB; the queue worker downloads from
 * storage with no such limit, so enforce the same bound here in depth. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** A single contract's extracted text beyond this is not a clause review but
 * a dump; fail loudly instead of queueing hours of provider fan-out. */
export const MAX_EXTRACTED_CHARS = 1_000_000;
/** Bounded provider fan-out (batches of 4) and bounded DB commit. */
export const MAX_SEGMENTS = 500;

/** Extract supported formats only. Never treat arbitrary binary as contract text. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('The uploaded file is empty.');
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('The uploaded file exceeds the 15 MB size limit.');
  }
  let text: string;
  if (mimeType === 'application/pdf') {
    try { text = (await pdf(buffer)).text; }
    catch { throw new Error('PDF text could not be extracted. Upload a readable PDF, DOCX or plain-text file.'); }
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try { text = (await mammoth.extractRawText({buffer})).value; }
    catch { throw new Error('DOCX text could not be extracted. Upload a readable document.'); }
  } else if (mimeType === 'text/plain') {
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(buffer); }
    catch { throw new Error('Plain-text documents must contain valid UTF-8 text.'); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('The uploaded file contains binary control characters.');
  } else {
    throw new Error('Unsupported document type. Use PDF, DOCX or plain text.');
  }
  if (!text.trim()) throw new Error('No readable text was found. Scanned images need OCR before upload.');
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new Error('The document text exceeds the review size limit. Split it into smaller documents before upload.');
  }
  return text;
}

/**
 * Join hyphenated line wraps ("confi-\ndentiality" -> "confidentiality").
 * PDF/DOCX extraction breaks long words at line ends; without this the
 * word never matches any risk pattern. Only a letter directly before the
 * hyphen and a lowercase continuation qualify, so spaced dashes
 * ("term - renewal") and genuine sentence breaks are untouched.
 */
function joinHyphenWraps(lines: string[]): string[] {
  const joined: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (/[A-Za-z]-$/.test(line) && i + 1 < lines.length && /^[a-z]/.test(lines[i + 1].trimStart())) {
      line = line.slice(0, -1) + lines[i + 1].trimStart();
      i++;
    }
    joined.push(line);
  }
  return joined;
}

/**
 * Segments extracted text into structured clauses.
 * Scans for section headers like "Section 4.1", "Article II", "10.5 Indemnity", etc.
 */
export function segmentClauses(text: string): RawSegment[] {
  if (typeof text !== 'string') throw new Error('Clause text must be a string.');
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new Error('The document text exceeds the review size limit. Split it into smaller documents before upload.');
  }
  const segments: RawSegment[] = [];
  let number = 'Preamble';
  let title = 'Introduction';
  let content: string[] = [];
  const flush = () => {
    const body = content.join('\n').trim();
    if (body) segments.push({number, title, text: body});
    content = [];
  };
  // Require a boundary after the number: "Section 1" must not match "Sectional".
  // Bare Roman numerals need punctuation, so "I agree" stays ordinary text.
  const explicit = /^(?:Section|Article|Clause)\s+(\d+(?:\.\d+)*|[IVXLCDM]+)(?=$|[\s:.)-])(?:[.:)\s-]*)(.*)$/i;
  // A bare number followed by lowercase running text ("30 days of the invoice")
  // is a wrapped sentence, not a heading. Numeric headings need a marker
  // ("1."), a dotted form ("3.1"), a title-case start ("10 Indemnity"), or the
  // number alone on the line. Missing a real header only keeps it in the
  // previous segment's text, while a false header silently fragments clause
  // analysis, so bias toward running text.
  // A four-digit year (1900-2099) at a line start is a date, not a section
  // number, even with a sentence-stop marker ("2024. Revenue grew.").
  const numericHeading = (line: string): RegExpExecArray | null => {
    const match = /^(\d+(?:\.\d+)*)(?:[.)]\s+|\s+|$)(.*)$/.exec(line);
    if (!match) return null;
    if (/^\d{4}$/.test(match[1])) {
      const year = Number(match[1]);
      if (year >= 1900 && year <= 2099) return null;
    }
    const marked = /^[0-9.]+[.)]/.test(line);
    const dotted = match[1].includes('.');
    const titled = /^[A-Z]/.test(match[2]);
    return marked || dotted || titled || match[2] === '' ? match : null;
  };
  const roman = /^([IVXLCDM]+)[.)]\s+(.*)$/;
  for (const rawLine of joinHyphenWraps(text.split(/\r?\n/))) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = explicit.exec(line) || numericHeading(line) || roman.exec(line);
    if (match) {
      flush();
      number = `Section ${match[1]}`;
      title = match[2]?.trim() || 'Clause';
    }
    // Keep headers and same-line provisions verbatim in the analyzed text.
    // Short provisions and header-only sections must never disappear silently.
    content.push(line);
  }
  flush();
  // A document pasted twice must not double-count one clause or double-bill
  // one review. Drop exact duplicates (same number, title and normalized
  // text); repeated section numbers with different text are kept but
  // disambiguated so downstream rows never share a number silently.
  const seen = new Set<string>();
  const deduped: RawSegment[] = [];
  for (const segment of segments) {
    const key = `${segment.number}\n${segment.title}\n${segment.text.replace(/\s+/g, ' ').trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(segment);
  }
  if (deduped.length > MAX_SEGMENTS) {
    throw new Error(`The document has ${deduped.length} clauses, above the ${MAX_SEGMENTS} review limit. Split it into smaller documents before upload.`);
  }
  const numberCounts = new Map<string, number>();
  for (const segment of deduped) {
    const count = (numberCounts.get(segment.number) ?? 0) + 1;
    numberCounts.set(segment.number, count);
    if (count > 1 && segment.number !== 'Preamble') {
      segment.number = `${segment.number} (${count})`;
    }
  }
  return deduped;
}
