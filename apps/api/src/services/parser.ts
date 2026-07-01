import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface RawSegment {
  number: string;
  title: string;
  text: string;
}

/**
 * Robust binary string extraction fallback for corrupted or non-standard PDF XRef tables.
 */
function extractStringsFromPdfBinary(buffer: Buffer): string {
  const binaryString = buffer.toString('binary');
  // Match parenthesized text strings (e.g. "(Hello World)")
  const matches = binaryString.match(/\(([^)]+)\)/g);
  if (!matches || matches.length < 10) {
    // Fallback: return printable ASCII/UTF-8 strings
    return buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
  }

  const textSegments = matches
    .map(m => {
      let content = m.slice(1, -1);
      // Clean PDF backslash-escaped characters (e.g. \), \(, etc.)
      content = content.replace(/\\(.)/g, '$1');
      return content;
    })
    .filter(c => c.trim().length > 2 && !/^[0-9\/\.\s\-]+$/.test(c));

  return textSegments.join(' ');
}

/**
 * Extracts text from file buffer based on MIME type.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdf(buffer);
      return data.text;
    } catch (err: any) {
      console.warn('// pdf-parse failed with XRef/corrupted structure error. Running binary recovery fallback...', err.message || err);
      return extractStringsFromPdfBinary(buffer);
    }
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  } else {
    // Treat as plain text
    return buffer.toString('utf-8');
  }
}

/**
 * Segments extracted text into structured clauses.
 * Scans for section headers like "Section 4.1", "Article II", "10.5 Indemnity", etc.
 */
export function segmentClauses(text: string): RawSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: RawSegment[] = [];
  
  let currentNum = '';
  let currentTitle = 'Introduction';
  let currentBody: string[] = [];

  // Regex patterns for section numbers
  // Matches "Section 1", "Section 4.2", "Article IV", "1.1", "10.5", "1.", etc.
  const sectionRegex = /^(?:(?:Section|Article|Clause)\s+([IVXLCDM\d\.]+)|(\d+\.\d+)|(\b[IVXLCDM]+\b))\s*[:-]?\s*(.*)$/i;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const match = line.match(sectionRegex);
    if (match) {
      // Save current segment before starting new one
      if (currentBody.length > 0 || currentNum || currentTitle !== 'Introduction') {
        segments.push({
          number: currentNum || 'Preamble',
          title: currentTitle.trim() || 'General Provision',
          text: currentBody.join('\n').trim()
        });
      }

      // Parse matches
      const sectionNum = match[1] || match[2] || match[3] || '';
      const sectionTitle = match[4] || '';
      
      currentNum = sectionNum ? `Section ${sectionNum}` : '';
      currentTitle = sectionTitle || 'Clause';
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Add the last segment
  if (currentBody.length > 0 || currentNum) {
    segments.push({
      number: currentNum || 'Closing',
      title: currentTitle.trim() || 'General Provision',
      text: currentBody.join('\n').trim()
    });
  }

  // Fallback if no structured segments were found
  if (segments.length === 0) {
    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\s*\n/);
    paragraphs.forEach((p, idx) => {
      const trimmed = p.trim();
      if (trimmed.length > 30) {
        segments.push({
          number: `Clause ${idx + 1}`,
          title: trimmed.split(/[.:\n]/)[0].substring(0, 40) || 'Provision',
          text: trimmed
        });
      }
    });
  }

  return segments.filter(s => s.text.length > 10);
}
