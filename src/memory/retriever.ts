// memory/retriever.ts
import { searchTopK } from "./qdrant";

export async function retrieveTopK(queryEmbedding: number[], k = 8, opts?: {
    kind?: "Script" | "Scene";
    updatedSinceSec?: number;
    session?: string;
    scoreThreshold?: number;
}) {
    const filter = { must: [] as Array<Record<string, unknown>> };
    if (opts?.kind) filter.must.push({ key: "kind", match: { value: opts.kind } });
    if (typeof opts?.updatedSinceSec === "number") {
        filter.must.push({ key: "updated_ts", range: { gte: Math.floor(Date.now() / 1000) - opts.updatedSinceSec } });
    }
    if (opts?.session) filter.must.push({ key: "session", match: { value: opts.session } });

    const hits = await searchTopK(queryEmbedding, k, filter.must.length ? filter : undefined, opts?.scoreThreshold);
    return hits.map(h => ({
        score: h.score,
        text: h.payload?.text,
        path: h.payload?.path,
        kind: h.payload?.kind,
        line_start: h.payload?.line_start,
        line_end: h.payload?.line_end
    }));
}
