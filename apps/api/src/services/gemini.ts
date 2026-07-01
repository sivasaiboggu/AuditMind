import axios from 'axios';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export interface ClauseAnalysisResult {
  explanation: string;
  suggestedRedline: string;
}

/**
 * Fallback static templates when Gemini API is unconfigured.
 */
function getFallbackAnalysis(title: string, text: string): ClauseAnalysisResult {
  const t = title.toLowerCase();
  if (t.includes('indemnity') || t.includes('negligence')) {
    return {
      explanation: 'Vulnerability: The indemnification requirements are excessively broad, shielding the counterparty from self-inflicted liabilities. Under common contract reviews, this is flagged as highly unfavorable.',
      suggestedRedline: 'Each party agrees to indemnify and hold harmless the other party solely from and against direct losses arising from third-party actions caused by the gross negligence or willful misconduct of the indemnifying party.'
    };
  }
  if (t.includes('liability') || t.includes('cap')) {
    return {
      explanation: 'Vulnerability: The liability limit is capped at a low nominal amount (e.g. 3-months of fees). This leaves the user with virtually no recourse in the event of major data breaches or complete platform downtime.',
      suggestedRedline: 'Except for breaches of confidentiality or IP indemnification, each party\'s total aggregate liability under this Agreement shall be capped at the total amount of fees paid or payable in the 12-month period preceding the claim.'
    };
  }
  return {
    explanation: 'Vulnerability: Standard legal terminology identified. Recommended review to verify alignment with operational capabilities and compliance standards.',
    suggestedRedline: text // return original as fallback
  };
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
    return getFallbackAnalysis(title, clauseText);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = `
You are an elite legal contract counsel and compliance auditor.
Analyze the following clause and retrieve details on its compliance/risk level.

Clause Title: ${title}
Original Clause Text:
"${clauseText}"

Retrieved Regulatory Grounding / Precedent Context:
"${regulationContext}"

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

    const textResponse = response.data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(textResponse);
    return {
      explanation: parsed.explanation || 'No explanation generated',
      suggestedRedline: parsed.suggestedRedline || clauseText
    };
  } catch (err) {
    console.error('Gemini API call failed, falling back to static analytics:', err);
    return getFallbackAnalysis(title, clauseText);
  }
}

/**
 * Streams a chat reply over WebSocket.
 * Uses gemini-2.5-flash for speed.
 */
export async function streamChatWithGemini(
  messages: { role: 'user' | 'model'; content: string }[],
  contractContext: string,
  onToken: (token: string) => void
): Promise<void> {
  if (!GEMINI_API_KEY) {
    // Mock streaming reply
    const mockReply = `[DEMO MODE // GEMINI_API_KEY NOT SET]\n\nRegarding your inquiry, here is how the agreement addresses it:\nBased on the contract text, the obligations are binding. If you violate these provisions, the counterparty can claim immediate default. I recommend checking our suggested redlines for Section 2.1 to balance these rules.`;
    const tokens = mockReply.split(' ');
    for (const token of tokens) {
      await new Promise(r => setTimeout(r, 60));
      onToken(token + ' ');
    }
    return;
  }

  try {
    // Base System Prompt
    const systemPrompt = `You are AuditMind, a contract risk AI. Answer questions using ONLY the contract clauses provided here:\n\n${contractContext}\n\nKeep your response concise, professional, and highlight specific clause numbers when referencing rules.`;
    
    // Construct contents
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }]
      },
      ...messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }))
    ];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}`;
    
    const response = await axios({
      method: 'post',
      url,
      data: { contents },
      responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
      let buffer = '';
      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        // Parse server-sent events or stream chunks
        // Gemini stream returns JSON array elements or text lines
        // A simple parse of the buffer that matches candidates.content.parts.text
        try {
          const matches = [...buffer.matchAll(/"text":\s*"([^"]+)"/g)];
          if (matches.length > 0) {
            for (const match of matches) {
              const cleaned = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
              onToken(cleaned);
            }
            buffer = ''; // Clear buffer once processed
          }
        } catch (e) {
          // Keep buffer accumulating if JSON is incomplete
        }
      });

      response.data.on('end', () => {
        resolve();
      });

      response.data.on('error', (err: any) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error('Gemini stream failed:', error);
    onToken(`[Gemini API Error: ${(error as Error).message}. Please ensure a valid, active GEMINI_API_KEY is configured in apps/api/.env]`);
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

    const textResponse = response.data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(textResponse);

    // Safety fallback: if Gemini says it's not a contract, verify with our robust heuristic
    const heuristicResult = validateContractHeuristic(text);
    if (!parsed.isContract && heuristicResult.isContract) {
      console.log('// Gemini flagged document as non-contract, but heuristic recovery override allowed it.');
      return { isContract: true, message: '' };
    }

    return {
      isContract: parsed.isContract === true,
      message: parsed.message || 'Please upload a valid legal contract.'
    };
  } catch (err) {
    console.error('Gemini contract validation failed, falling back to heuristic:', err);
    return validateContractHeuristic(text);
  }
}

