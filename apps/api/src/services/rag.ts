import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 
  : null;

export const UNAVAILABLE_CONTEXT = 'No verified regulatory context was retrieved. Do not infer applicable law or cite a precedent from this absence.';

/** Same threshold the match_regulations RPC is asked for; rows are also
 * filtered client-side so a misbehaving RPC cannot smuggle weak matches in. */
const MIN_SIMILARITY = 0.35;
/** At most this many excerpts reach the prompt, after dedup. */
const MAX_EXCERPTS = 3;
/** One corpus row is a paragraph, not a document; bound what it can inject. */
const MAX_EXCERPT_CHARS = 2000;
/** Bound the whole retrieved context so one large corpus cannot blow up the prompt. */
const MAX_CONTEXT_CHARS = 6000;
/** Embedding models cap input; truncate rather than failing the clause. */
const MAX_EMBED_CHARS = 8000;
/** Generic contract words that add no retrieval signal as keywords. */
const KEYWORD_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'under', 'shall', 'party', 'parties',
  'clause', 'section', 'agreement', 'contract', 'this', 'that', 'such',
  'will', 'may', 'upon', 'each', 'other', 'between', 'where', 'when',
]);

/**
 * Calls Gemini embedding model text-embedding-004.
 */
export async function getEmbedding(text: string): Promise<number[] | null> {
  if (!GEMINI_API_KEY) {
    return null; // Never send a fabricated zero vector to similarity search.
  }
  if (typeof text !== 'string' || !text.trim()) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, {
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text: text.slice(0, MAX_EMBED_CHARS) }]
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

interface CorpusRow {
  title: unknown;
  content: unknown;
  similarity?: unknown;
}

function normalizeForDedup(content: string): string {
  return content.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordSet(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(Boolean));
}

/** Jaccard overlap of two word sets; 1.0 is identical vocabulary. */
function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 1 : shared / union;
}

/**
 * Keep only usable excerpts: valid strings, at/above the similarity
 * threshold when the RPC reports one, and no near-duplicates. A short
 * excerpt contained in a longer one, or two excerpts sharing >=85% of
 * their vocabulary, are the same authority twice, not two sources.
 */
function selectExcerpts(rows: CorpusRow[]): { title: string; content: string }[] {
  const selected: { title: string; content: string; normalized: string; words: Set<string> }[] = [];
  for (const row of rows) {
    if (typeof row.title !== 'string' || typeof row.content !== 'string' ||
        !row.title.trim() || !row.content.trim()) continue;
    if (typeof row.similarity === 'number' &&
        (!Number.isFinite(row.similarity) || row.similarity < MIN_SIMILARITY)) continue;
    const normalized = normalizeForDedup(row.content);
    if (!normalized) continue;
    const words = wordSet(normalized);
    const duplicate = selected.some(kept =>
      kept.normalized === normalized ||
      jaccard(kept.words, words) >= 0.85 ||
      (normalized.length >= 40 && kept.normalized.includes(normalized)) ||
      (kept.normalized.length >= 40 && normalized.includes(kept.normalized)));
    if (duplicate) continue;
    selected.push({ title: row.title.trim(), content: row.content.trim(), normalized, words });
    if (selected.length >= MAX_EXCERPTS) break;
  }
  return selected.map(({ title, content }) => ({ title, content }));
}

/** Meaningful keyword terms for the Postgres text-search fallback. */
export function extractKeywordTerms(clauseText: string): string[] {
  const terms: string[] = [];
  for (const word of clauseText.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
    if (KEYWORD_STOPWORDS.has(word) || terms.includes(word)) continue;
    terms.push(word);
    if (terms.length >= 8) break;
  }
  return terms;
}

/**
 * Conducts hybrid vector similarity + keyword search on regulation corpus.
 */
export async function retrieveRegulations(
  clauseText: string,
  deps = {store: supabase, embed: getEmbedding}
): Promise<string> {
  if (!deps.store) return UNAVAILABLE_CONTEXT;
  if (typeof clauseText !== 'string' || !clauseText.trim()) return UNAVAILABLE_CONTEXT;
  try {
    const queryEmbedding = await deps.embed(clauseText);
    if (queryEmbedding) {
      const { data: vectorResults, error: vError } = await deps.store.rpc('match_regulations', {
        query_embedding: queryEmbedding, match_threshold: MIN_SIMILARITY, match_count: MAX_EXCERPTS
      });
      if (!vError && Array.isArray(vectorResults)) {
        const formatted = formatContext(vectorResults);
        if (formatted !== UNAVAILABLE_CONTEXT) return formatted;
      }
      // Vector rows that are all malformed, below threshold or duplicated
      // fall through to the keyword corpus below instead of giving up:
      // the absence of a usable vector hit is not the absence of context.
    }
    // Missing embeddings and vector-service errors can still use the real
    // configured corpus. They never substitute a made-up regulatory source.
    const terms = extractKeywordTerms(clauseText);
    if (terms.length === 0) return UNAVAILABLE_CONTEXT;
    const {data, error} = await deps.store.from('regulation_corpus')
      .select('title, content').textSearch('content', terms.join(' | ')).limit(4);
    return !error && Array.isArray(data) && data.length > 0 ? formatContext(data) : UNAVAILABLE_CONTEXT;
  } catch {
    return UNAVAILABLE_CONTEXT;
  }
}

function formatContext(rows: CorpusRow[]): string {
  const excerpts = selectExcerpts(rows);
  if (excerpts.length === 0) return UNAVAILABLE_CONTEXT;
  const header = 'Retrieved corpus excerpts only. Applicability and currency have not been verified.\n\n';
  let body = '';
  for (const excerpt of excerpts) {
    const content = excerpt.content.length > MAX_EXCERPT_CHARS
      ? excerpt.content.slice(0, MAX_EXCERPT_CHARS) + ' [...]'
      : excerpt.content;
    const block = `[SOURCE: ${excerpt.title}] ${content}`;
    if (body.length + block.length + 2 > MAX_CONTEXT_CHARS) break;
    body += (body ? '\n\n' : '') + block;
  }
  return body ? header + body : UNAVAILABLE_CONTEXT;
}
