// memory/progress.ts
import { EventEmitter } from 'node:events';
import type { IndexingStatus } from '../shared/indexing-types';

export const indexingBus = new EventEmitter();

export function emitStatus(status: IndexingStatus) {
    console.log(`📊 Indexing Status: ${status.phase} (${status.done}/${status.total}) ${status.lastFile || ''}`);
    indexingBus.emit('status', status);
}

// Helper to get Qdrant collection point count
export async function getQdrantPointCount(collection: string): Promise<number> {
    try {
        const BASE = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
        const res = await fetch(`${BASE}/collections/${encodeURIComponent(collection)}/points/count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exact: true })
        });
        
        if (!res.ok) {
            console.warn(`Failed to get Qdrant point count: ${res.status}`);
            return 0;
        }
        
        const data = await res.json();
        return data?.result?.count ?? 0;
    } catch (error) {
        console.warn('Failed to get Qdrant point count:', error);
        return 0;
    }
}
