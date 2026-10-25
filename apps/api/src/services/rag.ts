import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 
  : null;

const UNAVAILABLE_CONTEXT = 'No verified regulatory context was retrieved. Do not infer applicable law or cite a precedent from this absence.';

/**
 * Calls Gemini embedding model text-embedding-004.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) {
    return null; // Never send a fabricated zero vector to similarity search.
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, {
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text }]
      }
    }, { timeout: 3000 });
    const values = response.data?.embedding?.values;
    return Array.isArray(values) && values.length === 768 &&
      values.every(v => typeof v === 'number' && Number.isFinite(v)) &&
      values.some(v => v !== 0) ? values : null;
  } catch (error) {
    console.error('Regulatory embedding could not be retrieved.');
    return null;
  }
}

/**
 * Conducts hybrid vector similarity + keyword search on regulation corpus.
 */
export async function retrieveRegulations(
  clauseText: string,
  deps = {store: supabase, embed: getEmbedding}
): Promise<string> {
  if (!deps.store) return UNAVAILABLE_CONTEXT;
  try {
    const queryEmbedding = await deps.embed(clauseText);
    if (queryEmbedding) {
      const { data: vectorResults, error: vError } = await deps.store.rpc('match_regulations', {
        query_embedding: queryEmbedding, match_threshold: 0.35, match_count: 3
      });
      if (!vError && Array.isArray(vectorResults) && vectorResults.length > 0) {
        return formatContext(vectorResults);
      }
    }
    // Missing embeddings and vector-service errors can still use the real
    // configured corpus. They never substitute a made-up regulatory source.
    const terms = clauseText.match(/[\p{L}\p{N}]{3,}/gu)?.slice(0,5) ?? [];
    if (terms.length === 0) return UNAVAILABLE_CONTEXT;
    const {data, error} = await deps.store.from('regulation_corpus')
      .select('title, content').textSearch('content', terms.join(' | ')).limit(2);
    return !error && Array.isArray(data) && data.length > 0 ? formatContext(data) : UNAVAILABLE_CONTEXT;
  } catch {
    return UNAVAILABLE_CONTEXT;
  }
}

function formatContext(rows: Array<{title: unknown; content: unknown}>): string {
  const valid = rows.filter(r => typeof r.title === 'string' && typeof r.content === 'string' && r.title.trim() && r.content.trim());
  return valid.length > 0
    ? 'Retrieved corpus excerpts only. Applicability and currency have not been verified.\n\n' + valid.map(r => `[SOURCE: ${r.title}] ${r.content}`).join('\n\n')
    : UNAVAILABLE_CONTEXT;
}
