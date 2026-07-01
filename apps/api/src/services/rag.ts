import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 
  : null;

// Local regulatory database fallback for testing/demo
const LOCAL_REGULATIONS = [
  {
    title: 'UCC § 2-302 (Unconscionable Contract or Clause)',
    content: 'If the court as a matter of law finds the contract or any clause of the contract to have been unconscionable at the time it was made, the court may refuse to enforce the contract, or it may enforce the remainder of the contract without the unconscionable clause, or it may so limit the application of any unconscionable clause as to avoid any unconscionable result.'
  },
  {
    title: 'GDPR Article 7 (Conditions for Consent)',
    content: 'If the data subject\'s consent is given in the context of a written declaration which also concerns other matters, the request for consent shall be presented in a manner which is clearly distinguishable from the other matters, in an intelligible and easily accessible form, using clear and plain language. Any part of such a declaration which constitutes an infringement of this Regulation shall not be binding.'
  },
  {
    title: 'Standard Indemnity Requirment (Commercial Contract Law)',
    content: 'Standard commercial indemnification rules require that a party should only bear responsibility for damages or losses directly caused by its own actions or omission of actions, and never for the other party\'s gross negligence or willful misconduct.'
  },
  {
    title: 'FTC Safeguards Rule 16 CFR § 314',
    content: 'Requires financial institutions to develop, implement, and maintain a comprehensive information security program. Service providers must contractually commit to maintaining safeguards that protect customer data.'
  }
];

/**
 * Calls Gemini embedding model text-embedding-004.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    return Array(768).fill(0); // return dummy embedding
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, {
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text }]
      }
    }, { timeout: 3000 });
    return response.data.embedding.values;
  } catch (error) {
    console.error('Failed to retrieve Gemini embedding:', error);
    return Array(768).fill(0);
  }
}

/**
 * Conducts hybrid vector similarity + keyword search on regulation corpus.
 */
export async function retrieveRegulations(clauseText: string): Promise<string> {
  if (!supabase) {
    // Local keyword-match search on fallback regulations
    const query = clauseText.toLowerCase();
    const matches = LOCAL_REGULATIONS.filter(reg => 
      reg.title.toLowerCase().split(' ').some(word => word.length > 3 && query.includes(word)) ||
      reg.content.toLowerCase().split(' ').some(word => word.length > 4 && query.includes(word))
    );
    
    const results = matches.length > 0 ? matches : LOCAL_REGULATIONS.slice(0, 2);
    return results.map(r => `[SOURCE: ${r.title}] ${r.content}`).join('\n\n');
  }

  try {
    const queryEmbedding = await getEmbedding(clauseText);
    
    // Call Supabase RPC for vector similarity (pgvector match_regulations)
    const { data: vectorResults, error: vError } = await supabase.rpc('match_regulations', {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 3
    });

    if (vError) throw vError;

    if (vectorResults && vectorResults.length > 0) {
      return vectorResults.map((r: any) => `[SOURCE: ${r.title}] ${r.content}`).join('\n\n');
    }

    // Fallback to text matching (keyword/FTS) if vector matches are sparse
    const { data: keywordResults, error: kError } = await supabase
      .from('regulation_corpus')
      .select('title, content')
      .textSearch('content', clauseText.split(' ').slice(0, 5).join(' | '))
      .limit(2);

    if (kError) throw kError;

    if (keywordResults && keywordResults.length > 0) {
      return keywordResults.map((r: any) => `[SOURCE: ${r.title}] ${r.content}`).join('\n\n');
    }

    return 'No direct matching regulatory precedent identified in the corpus.';
  } catch (error) {
    console.error('Database RAG search failed, using local fallback:', error);
    return LOCAL_REGULATIONS.slice(0, 2).map(r => `[SOURCE: ${r.title}] ${r.content}`).join('\n\n');
  }
}
