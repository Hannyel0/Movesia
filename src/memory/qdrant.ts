// memory/qdrant.ts
// No SDK needed; use REST so it works everywhere.
export type QdrantPoint = {
    id: string | number;
    vector: number[];                     // embedding
    payload: Record<string, unknown>;     // { path, guid, kind, session, updated_ts, text, line_* }
};

const BASE = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";
const COLLECTION = process.env.QDRANT_COLLECTION ?? "movesia";

// 1) wait until Qdrant is ready
export async function waitQdrantReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/readyz`);
      if (r.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("Qdrant not ready");
}

// 2) drop collection completely (fast & reliable)
export async function dropCollection() {
  const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}`, {
    method: "DELETE"
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Qdrant drop failed: ${res.status} — ${await res.text()}`);
  }
}

// 3) recreate with RAM payload to avoid Gridstore during dev
export async function createCollection(dim: number) {
  const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      vectors: { size: dim, distance: "Cosine" },
      on_disk_payload: false   // was true; keep it false for stability
    }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`Qdrant create failed: ${res.status} — ${await res.text()}`);
  }
}

// 4) optional but recommended: index fields you filter on
export async function ensurePayloadIndex(field: string, schema: "keyword" | "text" = "keyword") {
  const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/index`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ field_name: field, field_schema: schema }),
  });
  if (!res.ok) throw new Error(`Qdrant index(${field}) failed: ${res.status} — ${await res.text()}`);
}

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
            on_disk_payload: false   // keep it false for stability 
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
    if (!res.ok) {
        const text = await res.text(); // <-- dump details
        throw new Error(`Qdrant upsert failed: ${res.status} — ${text}`);
    }
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

async function scrollIdsByPath(path: string): Promise<(string|number)[]> {
  const ids: (string|number)[] = [];
  let offset: string | number | null = null;
  while (true) {
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/points/scroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: { must: [{ key: "rel_path", match: { value: path } }] },
        with_payload: false,
        limit: 1024,
        offset
      })
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status} — ${await res.text()}`);
    const j = await res.json();
    ids.push(...(j.result?.points?.map((p: { id: string }) => p.id) ?? []));
    offset = j.result?.next_page_offset ?? null;
    if (!offset) break;
  }
  return ids;
}

/**
 * Hard delete points by relative path (recommended for file deletions)
 */
export async function deletePointsByPath(relPath: string) {
    // Normalize path: forward slashes, no leading ./
    const normalizedPath = relPath.replaceAll("\\", "/").replace(/^\.\//, "");
    
    const ids = await scrollIdsByPath(normalizedPath);
    if (!ids.length) return;
    await deletePointsByIds(ids);
}

/**
 * Hard delete points by asset GUID
 */
export async function deletePointsByGuid(guid: string) {
    // Normalize GUID: lowercase, no braces
    const normalizedGuid = guid.toLowerCase().replace(/[{}]/g, "");
    
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/points/delete?wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            filter: {
                must: [
                    { key: "guid", match: { value: normalizedGuid } }
                ]
            }
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Qdrant delete by GUID failed: ${res.status} — ${text}`);
    }
}

/**
 * Hard delete points by explicit point IDs
 */
export async function deletePointsByIds(pointIds: (string | number)[]) {
    const res = await fetch(`${BASE}/collections/${encodeURIComponent(COLLECTION)}/points/delete?wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            points: pointIds
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Qdrant delete by IDs failed: ${res.status} — ${text}`);
    }
}
