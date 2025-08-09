// memory/qdrant.ts
// No SDK needed; use REST so it works everywhere.
export type QdrantPoint = {
    id: string | number;
    vector: number[];                     // embedding
    payload: Record<string, unknown>;     // { path, guid, kind, session, updated_ts, text, line_* }
};

const BASE = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "movesia";

export async function ensureCollection(dim: number) {
    // 1) Fast path: exists?
    const existsRes = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/exists`);
    if (existsRes.ok) {
        const j = await existsRes.json();
        if (j?.result?.exists === true) return; // already there
    }

    // 2) Create (idempotent)
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
            vectors: { size: dim, distance: "Cosine" }, 
            on_disk_payload: true 
        }),
    });

    // If someone else created it in the meantime, 409 is fine
    if (res.status === 409) return;
    if (!res.ok) throw new Error(`Qdrant create collection failed: ${res.status}`);
}

export async function upsertPoints(points: QdrantPoint[]) {
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/points`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points }),
    });
    if (!res.ok) throw new Error(`Qdrant upsert failed: ${res.status}`);
}

export async function searchTopK(queryEmbedding: number[], k = 8, filter?: Record<string, unknown>, scoreThreshold?: number) {
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/points/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            vector: queryEmbedding,
            limit: k,
            with_payload: true,
            filter,
            score_threshold: scoreThreshold,
        }),
    });
    if (!res.ok) throw new Error(`Qdrant search failed: ${res.status}`);
    const data = await res.json();
    return (data?.result ?? []) as Array<{ id: string; score: number; payload: Record<string, unknown> }>;
}
