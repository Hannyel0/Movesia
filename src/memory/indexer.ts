// memory/indexer.ts
import type Database from "better-sqlite3";
import { chunkFile } from "./chunker";
import { logEvent, upsertAssets, markDeleted, upsertScene } from "./sqlite";
import { ensureCollection, upsertPoints } from "./qdrant";

export type Embedder = { dim: number; embed(texts: string[]): Promise<number[][]> };

export class Indexer {
    constructor(private db: Database.Database, private embedder: Embedder) { }

    async initVectorCollection() {
        // Collection is already ensured in orchestrator.ts - no need to call again
        // This method is kept for future indexer-specific initialization if needed
    }

    handleUnityEvent = async (evt: { ts: number; type: string; session?: string; body: Record<string, unknown> }) => {
        logEvent(this.db, evt);

        switch (evt.type) {
            case "assets_imported":
            case "assets_moved": {
                const importedItems = (evt.body.items as Array<{ guid: string; path: string; kind?: string; mtime?: number; size?: number; hash?: string; deps?: string[] }>) ?? [];
                upsertAssets(this.db, importedItems, evt.ts);
                // Filter items that have a kind property before indexing
                const itemsWithKind = importedItems.filter((item): item is { guid: string; path: string; kind: string; mtime?: number; size?: number; hash?: string; deps?: string[] } => 
                    item.kind !== undefined
                );
                await this.indexTextualItems(itemsWithKind, evt.session ?? undefined, evt.ts);
                break;
            }

            case "assets_deleted": {
                const deletedItems = (evt.body.items as Array<{ guid: string }>) ?? [];
                markDeleted(this.db, deletedItems, evt.ts);
                break;
            }

            case "scene_saved": {
                const sceneGuid = evt.body.guid as string;
                const scenePath = evt.body.path as string;
                upsertScene(this.db, { guid: sceneGuid, path: scenePath, ts: evt.ts });
                await this.indexScene(scenePath, evt.session ?? undefined, evt.ts);
                break;
            }

            // project_changed, will_save_assets, compile_* → we just log
        }
    };

    private async indexTextualItems(items: Array<{ kind: string; path: string }>, session: string | undefined, ts: number) {
        const textual = items.filter((x) => x.kind === "MonoScript" || x.kind === "TextAsset");
        for (const it of textual) {
            await this.indexScript(it.path, session, ts);
        }
    }

    private async indexScript(path: string, session: string | undefined, ts: number) {
        const chunks = await chunkFile(path, "Script");
        const vectors = await this.embedder.embed(chunks.map(c => c.text));
        const points = chunks.map((c, i) => ({
            id: c.id,
            vector: vectors[i],
            payload: {
                path: c.path, kind: "Script", session, updated_ts: ts,
                text: c.text, line_start: c.line_start, line_end: c.line_end, hash: c.hash
            }
        }));
        await upsertPoints(points);
    }

    private async indexScene(path: string, session: string | undefined, ts: number) {
        const chunks = await chunkFile(path, "Scene", 700, 30);
        const vectors = await this.embedder.embed(chunks.map(c => c.text));
        const points = chunks.map((c, i) => ({
            id: c.id,
            vector: vectors[i],
            payload: {
                path: c.path, kind: "Scene", session, updated_ts: ts,
                text: c.text, line_start: c.line_start, line_end: c.line_end, hash: c.hash
            }
        }));
        await upsertPoints(points);
    }
}
