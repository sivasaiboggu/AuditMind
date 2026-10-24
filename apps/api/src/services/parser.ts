import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface RawSegment {
  number: string;
  title: string;
  text: string;
}

/** Extract supported formats only. Never treat arbitrary binary as contract text. */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
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
  return text;
}

/**
 * Segments extracted text into structured clauses.
 * Scans for section headers like "Section 4.1", "Article II", "10.5 Indemnity", etc.
 */
export function segmentClauses(text: string): RawSegment[] {
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
  const numbered = /^(\d+(?:\.\d+)*)(?:[.)]\s+|\s+|$)(.*)$/;
  const roman = /^([IVXLCDM]+)[.)]\s+(.*)$/;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = explicit.exec(line) || numbered.exec(line) || roman.exec(line);
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
  return segments;
}
