/** Phase 2 embedding + relevance defaults. */

/** Active neural model id (MiniLM). Hash fallback uses syncle-hash-v2. */
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;
/** Cosine gate for MiniLM (plan ~0.80; 0.65 works better for short quotes vs long articles). */
export const SEMANTIC_THRESHOLD = 0.65;
/** Looser gate when falling back to hash embedder. */
export const HASH_SEMANTIC_THRESHOLD = 0.28;
export const MAX_EMBED_CHARS = 3500;
export const MAX_SEMANTIC_HITS = 5;
/** Cache page-context embedding this long. */
export const PAGE_CONTEXT_TTL_MS = 8 * 60 * 1000;
export const PAGE_CONTEXT_IDLE_MS = 500;

export const SEMANTIC_DISMISS_KEY = "syncle_semantic_dismiss_v1";
export const PAGE_CONTEXT_CACHE_KEY = "syncle_page_ctx_embed_v1";
