// shared/indexing-types.ts
// Unified IndexingStatus types used by both main and renderer processes

export type IndexingPhase = 'idle' | 'scanning' | 'embedding' | 'writing' | 'qdrant' | 'complete' | 'error';

export interface IndexingStatus {
  phase: IndexingPhase;
  total: number;      // planned items
  done: number;       // processed items
  lastFile?: string;
  qdrantPoints?: number; // optional sanity count
  message?: string;
  error?: string;
}
