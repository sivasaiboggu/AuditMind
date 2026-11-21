import axios from 'axios';
import { readGeminiSse } from './gemini-stream.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/** Prompt bounds: a long clause plus retrieved context must not blow up the
 * model call or silently truncate inside the provider. */
const MAX_CLAUSE_PROMPT_CHARS = 12000;
const MAX_CONTEXT_PROMPT_CHARS = 6000;

export interface ClauseAnalysisResult {
  explanation: string;
  suggestedRedline: string;
}

/**
 * Errors from the explanation provider carry a machine-readable code so the
 * pipeline can tell "Gemini is down" (rule-based fallback) from "Gemini
 * answered with garbage" (fail the run, never fabricate). The message text
 * is unchanged for existing callers.
 */
export function geminiError(message: string, code: 'GEMINI_UNAVAILABLE' | 'GEMINI_INVALID_RESPONSE'): Error {
  return Object.assign(new Error(message), { code });
}

function isUnavailable(error: any): boolean {
  const status = error?.response?.status;
  if (status === 401 || status === 403 || status === 429 || status === 503) return true;
  const message = String(error?.message ?? '');
  return error?.code === 'ECONNABORTED' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED' ||
    /timeout|network|econn|429|503/i.test(message);
}

function truncateForPrompt(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '\n[... truncated for review ...]' : text;
}

/**
 * Generate clause explanation and suggested redline.
 * Uses gemini-2.5-pro or gemini-2.5-flash for structured legal drafting.
 */
export async function analyzeClauseWithGemini(
  title: string,
  clauseText: string,
  regulationContext: string
): Promise<ClauseAnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw geminiError('Clause explanation service is not configured.', 'GEMINI_UNAVAILABLE');
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = `
You are an elite legal contract counsel and compliance auditor.
Analyze the following clause and retrieve details on its compliance/risk level.

Clause Title: ${title}
Original Clause Text:
"${truncateForPrompt(clauseText, MAX_CLAUSE_PROMPT_CHARS)}"

Retrieved Regulatory Grounding / Precedent Context:
"${truncateForPrompt(regulationContext, MAX_CONTEXT_PROMPT_CHARS)}"

Output your response as a valid JSON object matching the following structure:
{
  "explanation": "Plain-English explanation detailing why this clause poses a risk, the specific legal issues, and how it impacts the signer.",
  "suggestedRedline": "Proposed safer, compromise-friendly draft text that balances risk while remaining acceptable to the other party."
}

Do not include markdown tags like \`\`\`json. Return only raw JSON.
`;

    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, { timeout: 5000 });

    const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof textResponse !== 'string' || !textResponse.trim()) {
      throw geminiError('Clause explanation service did not return a valid assessment.', 'GEMINI_INVALID_RESPONSE');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(textResponse); }
    catch { throw geminiError('Clause explanation service did not return a valid assessment.', 'GEMINI_INVALID_RESPONSE'); }
    if (typeof parsed !== 'object' || parsed === null ||
        typeof (parsed as any).explanation !== 'string' || !(parsed as any).explanation.trim() ||
        typeof (parsed as any).suggestedRedline !== 'string') {
      throw geminiError('Clause explanation service did not return a valid assessment.', 'GEMINI_INVALID_RESPONSE');
    }
    return { explanation: (parsed as any).explanation, suggestedRedline: (parsed as any).suggestedRedline };
  } catch (err: any) {
    console.error('Clause explanation provider failed.');
    if (err?.code === 'GEMINI_UNAVAILABLE' || err?.code === 'GEMINI_INVALID_RESPONSE') throw err;
    throw geminiError(
      'Clause explanation service did not return a valid assessment.',
      isUnavailable(err) ? 'GEMINI_UNAVAILABLE' : 'GEMINI_INVALID_RESPONSE');
  }
}

export type ChatMessage = { role: 'user' | 'model'; content: string };

/**
 * Gemini rejects consecutive same-role contents. Merge them (and drop
 * empty ones) so a history like user, user, model still forms a valid
 * alternating request. Pure and unit-tested without any provider call.
 */
export function buildChatContents(
  messages: ChatMessage[],
  systemPrompt: string
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const merged: ChatMessage[] = [];
  for (const message of messages) {
    if (!message || typeof message.content !== 'string' || !message.content.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.content += '\n' + message.content;
    else merged.push({ role: message.role, content: message.content });
  }
  const contents = merged.map(msg => ({ role: msg.role, parts: [{ text: msg.content }] }));
  // Gemini rejects consecutive same-role contents. The system prompt is
  // sent as a user turn, so when the history opens with a user message the
  // prompt folds into it instead of emitting two user turns in a row; when
  // the history opens with a model turn the prompt stays its own user turn
  // and the roles still alternate.
  if (contents.length > 0 && contents[0].role === 'user') {
    contents[0] = {
      role: 'user',
      parts: [{ text: `${systemPrompt}\n\n${contents[0].parts[0].text}` }],
    };
    return contents;
  }
  return [
    { role: 'user', parts: [{ text: systemPrompt }] },
    ...contents,
  ];
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Streams a chat reply over WebSocket.
 * Uses gemini-2.5-flash for speed.
 */
export async function streamChatWithGemini(
  messages: ChatMessage[],
  contractContext: string,
  onToken: (token: string) => void
): Promise<void> {
  if (!GEMINI_API_KEY) {
    // Mock streaming reply
    const mockReply = '[Explanation service unavailable] No AI contract assessment was performed. Review the original clauses directly or ask qualified counsel. No obligations, default terms or clause references have been inferred.';
    const tokens = mockReply.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 60));
      onToken(token + ' ');
    }
    return;
  }

  let answerStarted = false;
  try {
    // Base System Prompt
    const systemPrompt = `You are AuditMind, a contract risk AI. Answer questions using ONLY the contract clauses provided here:\n\n${contractContext}\n\nKeep your response concise, professional, and highlight specific clause numbers when referencing rules.`;

    // Construct contents
    const contents = buildChatContents(messages, systemPrompt);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const response = await axios({
      method: 'post',
      url,
      data: { contents },
      responseType: 'stream',
      timeout: 15000
    });

    await readGeminiSse(response.data, token => {
      answerStarted = true;
      onToken(token);
    });
  } catch (error: any) {
    // Never log provider request objects: they can include keys and contract text.
    console.error('Gemini stream could not be completed.');
    if (answerStarted) {
      throw new Error('The streamed answer was interrupted and is incomplete. Please retry.');
    }

    // Determine the latest user query from the messages array
    const userQuery = [...messages].reverse().find(m => m?.role === 'user')?.content || '';
    const lowercaseQuery = userQuery.toLowerCase();

    // Find matching sections in the contract context using keyword intersection
    const lines = contractContext.split(/\n+/).map(l => l.trim()).filter(l => l.length > 15);

    const keywords = lowercaseQuery
      .replace(/[?:!.,;'"()\[\]]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !['what', 'when', 'where', 'with', 'from', 'this', 'that', 'then', 'have', 'does', 'clause', 'section', 'the', 'and', 'for'].includes(w));

    // Rank lines by how many distinct query keywords they contain (whole
    // words only, so "law" no longer matches "flaw"), best first.
    const ranked: { line: string; hits: number }[] = [];
    if (keywords.length > 0) {
      for (const line of lines) {
        const lower = line.toLowerCase();
        const hits = keywords.filter(word => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(lower)).length;
        if (hits > 0) ranked.push({ line, hits });
      }
      ranked.sort((a, b) => b.hits - a.hits);
    }
    const matchingLines = ranked.slice(0, 4).map(r => r.line);

    // Check if the error is a quota/auth error (403) vs a real crash
    const isQuotaError = error?.response?.status === 403 || error?.response?.status === 429 || String(error?.message).includes('403') || String(error?.message).includes('429');

    let response = '';

    if (isQuotaError) {
      response = `⚠️ AI Chat is currently in Local Search Mode (Gemini API quota reached).`;
    } else {
      response = `⚠️ AI Chat is currently in Local Search Mode (connection error).`;
    }

    if (matchingLines.length > 0) {
      response += `\n\nBased on a local scan of this contract, here are the most relevant provisions for your query:\n\n${matchingLines.map((line, i) => `${i + 1}. ${line}`).join('\n\n')}`;
      response += `\n\nFor deeper AI-powered analysis, please update your GEMINI_API_KEY in apps/api/.env with an active key from https://aistudio.google.com/`;
    } else {
      // Show the first few clauses as baseline context
      const baseline = lines.slice(0, 3);
      response += `\n\nI scanned the contract text but couldn't find an exact match for your query. Here are the primary provisions of this agreement:\n\n${baseline.map((line, i) => `${i + 1}. ${line}`).join('\n\n')}`;
      response += `\n\nFor full AI-powered Q&A, update your GEMINI_API_KEY in apps/api/.env with an active key from https://aistudio.google.com/`;
    }

    // Stream the response token by token for smooth UX
    const words = response.split(' ');
    for (const word of words) {
      await new Promise(r => setTimeout(r, 18));
      onToken(word + ' ');
    }
  }
}

/**
 * Validates whether the document content looks like a legal contract/agreement.
 * Uses legal keyword density as a fast heuristic.
 */
function validateContractHeuristic(text: string): { isContract: boolean; message: string } {
  const lowercase = text.toLowerCase();
  const legalKeywords = [
    'agreement', 'contract', 'hereby', 'indemnify', 'indemnification',
    'liability', 'jurisdiction', 'confidentiality', 'termination',
    'licensor', 'licensee', 'covenant', 'whereas', 'governing law',
    'shall', 'party', 'parties', 'services', 'effective date', 'terms', 'thereto'
  ];
  let matches = 0;
  for (const kw of legalKeywords) {
    if (lowercase.includes(kw)) {
      matches++;
    }
  }

  // If the document is extremely short (under 500 characters) and has no legal keywords, reject it.
  // Otherwise, if the document has any legal keywords or is long, allow it to pass.
  if (matches < 1 && text.length < 500) {
    return {
      isContract: false,
      message: 'The uploaded document does not appear to be a legal contract. Please upload a valid contract file (such as an NDA, SLA, Lease, or License Agreement).'
    };
  }
  return { isContract: true, message: '' };
}

/**
 * Validates if the document is a legal contract using Gemini.
 */
export async function validateContractWithGemini(text: string): Promise<{ isContract: boolean; message: string }> {
  if (!GEMINI_API_KEY) {
    return validateContractHeuristic(text);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const sampleText = text.substring(0, 1500);
    const prompt = `
You are an expert legal document triage assistant. 
Analyze the following text snippet from the beginning of an uploaded document and determine if this document is a legal contract, agreement, covenant, terms of service, NDA, or similar binding legal instrument.
If it is technical documentation, a tutorial, source code, a recipe, a book, a resume, or generic text, it is NOT a contract.

Document Text Snippet:
"${sampleText}"

Output your response as a valid JSON object matching the following structure:
{
  "isContract": true or false,
  "message": "If isContract is true, leave empty. If false, write a polite, clear explanation asking the user to upload a valid legal contract (e.g. NDA, Service Agreement, or Lease) instead."
}

Do not include markdown tags like \`\`\`json. Return only raw JSON.
`;

    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    }, { timeout: 3000 });

    const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof textResponse !== 'string' || !textResponse.trim()) throw new Error('Invalid contract validation response.');
    const parsed: unknown = JSON.parse(textResponse);

    // Safety fallback: if Gemini says it's not a contract, verify with our robust heuristic
    const heuristicResult = validateContractHeuristic(text);
    if (typeof parsed === 'object' && parsed !== null && (parsed as any).isContract !== true && heuristicResult.isContract) {
      console.log('// Gemini flagged document as non-contract, but heuristic recovery override allowed it.');
      return { isContract: true, message: '' };
    }

    return {
      isContract: typeof parsed === 'object' && parsed !== null && (parsed as any).isContract === true,
      message: typeof parsed === 'object' && parsed !== null && typeof (parsed as any).message === 'string' && (parsed as any).message
        ? (parsed as any).message
        : 'Please upload a valid legal contract.'
    };
  } catch (err) {
    console.error('Contract validation provider failed.');
    return validateContractHeuristic(text);
  }
}
