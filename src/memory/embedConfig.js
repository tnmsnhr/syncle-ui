/** Phase 2 embedding + relevance defaults. */

/** Active neural model id (MiniLM). Hash fallback uses syncle-hash-v2. */
export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;
/** Chunk-max cosine. Strong matches clear this; borderline ones also need a lead. */
export const SEMANTIC_THRESHOLD = 0.72;
/** Leader at or above this can show without beating the next hit. */
export const SEMANTIC_STRONG = 0.8;
/** Below the strong band, the top hit must lead the next by this much. */
export const SEMANTIC_GAP = 0.05;
/** Looser gate when falling back to hash embedder. */
export const HASH_SEMANTIC_THRESHOLD = 0.28;
export const MAX_EMBED_CHARS = 3500;
export const MAX_SEMANTIC_HITS = 3;
export const MAX_PAGE_CHUNKS = 8;
/** Cache page-context embedding this long. */
export const PAGE_CONTEXT_TTL_MS = 8 * 60 * 1000;
export const PAGE_CONTEXT_IDLE_MS = 500;

export const SEMANTIC_DISMISS_KEY = "syncle_semantic_dismiss_v1";
export const PAGE_CONTEXT_CACHE_KEY = "syncle_page_ctx_embed_v1";
