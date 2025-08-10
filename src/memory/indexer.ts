// memory/indexer.ts
import type Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs/promises";
import { upsertPoints, deletePointsByPath, deletePointsByGuid } from "./qdrant";
import { logEvent, upsertAssets, markDeleted, upsertScene } from "./sqlite";
import { makePointIdFromChunkKey } from "./ids";

export type Embedder = { dim: number; embed(texts: string[]): Promise<number[][]> };

function normalizeRel(p: string) {
    // Store a normalized relative path (forward slashes)
    return p.replaceAll("\\", "/");
}

export class Indexer {
    private projectRoot: string | null = null;
    private sessionRoots = new Map<string, string>();

    constructor(private db: Database.Database, private embedder: Embedder) { }

    setProjectRoot(root: string) {
        this.projectRoot = root;

    }

    setSessionRoot(session: string, root: string) {
        this.sessionRoots.set(session, root);

    }

    private resolveAbsFrom(evt: { body: Record<string, unknown>; session?: string }, relOrAbs: string) {
        if (path.isAbsolute(relOrAbs)) return path.normalize(relOrAbs);
        const base = (evt.session && this.sessionRoots.get(evt.session)) || this.projectRoot;
        if (!base) throw new Error(`No project root set for session ${evt.session ?? "(none)"}; cannot resolve ${relOrAbs}`);
        return path.normalize(path.join(base, relOrAbs.replace(/\//g, path.sep)));
    }

    private async readFileWithRetry(abs: string, tries = 5) {
        let lastErr: Error;
        for (let i = 0; i < tries; i++) {
            try {
                return await fs.readFile(abs, "utf8");
            }
            catch (e: unknown) {
                const error = e as Error & { code?: string };
                lastErr = error;
                if (error?.code !== "ENOENT") throw error;
                await new Promise(resolve => setTimeout(resolve, 150 * Math.pow(2, i))); // backoff
            }
        }
        throw lastErr;
    }

    private async chunkText(text: string, absPath: string, kind: "Script" | "Scene", targetTokens = 500, overlapLines = 20) {
        const lines = text.split(/\r?\n/);
        const approxTokPerLine = 4; // rough
        const linesPerChunk = Math.max(30, Math.floor(targetTokens / approxTokPerLine));

        const chunks: Array<{
            id: string;
            path: string;
            kind: "Script" | "Scene";
            text: string;
            line_start: number;
            line_end: number;
            hash: string;
        }> = [];

        let i = 0;
        while (i < lines.length) {
            const end = Math.min(i + linesPerChunk, lines.length);
            const chunkLines = lines.slice(i, end);
            const chunkText = chunkLines.join('\n');

            // Simple hash function
            let hash = 2166136261 >>> 0;
            for (let j = 0; j < chunkText.length; j++) {
                hash = (hash ^ chunkText.charCodeAt(j)) * 16777619 >>> 0;
            }

            const chunkKey = `${absPath}#${i + 1}-${end}#${hash.toString(16)}`;
            chunks.push({
                id: makePointIdFromChunkKey(chunkKey),
                path: absPath,
                kind,
                text: chunkText,
                line_start: i + 1,
                line_end: end,
                hash: hash.toString(16)
            });

            i += Math.max(1, linesPerChunk - overlapLines);
        }

        return chunks;
    }

    async initVectorCollection() {
        // Collection is already ensured in orchestrator.ts - no need to call again
        // This method is kept for future indexer-specific initialization if needed
    }

    handleUnityEvent = async (evt: { ts: number; type: string; session?: string; body: Record<string, unknown> }) => {

        if (evt.type === "hb" || evt.type === "hello" || evt.type === "ack") return;

        logEvent(this.db, evt);

        switch (evt.type) {
            case "assets_imported": {
                const importedItems = (evt.body.items as Array<{ guid: string; path: string; kind?: string; mtime?: number; size?: number; hash?: string; deps?: string[] }>) ?? [];
                upsertAssets(this.db, importedItems, evt.ts);
                // Filter items that have a kind property before indexing
                const itemsWithKind = importedItems.filter((item): item is { guid: string; path: string; kind: string; mtime?: number; size?: number; hash?: string; deps?: string[] } =>
                    item.kind !== undefined
                );
                await this.indexTextualItems(itemsWithKind, evt, evt.ts);
                break;
            }

            case "assets_moved": {
                const movedItems = (evt.body.items as Array<{ guid: string; path: string; from?: string; kind?: string; mtime?: number; size?: number; hash?: string; deps?: string[] }>) ?? [];

                // 1) Update SQLite with new paths
                upsertAssets(this.db, movedItems, evt.ts);

                // 2) Handle Qdrant cleanup and re-indexing
                for (const item of movedItems) {
                    try {
                        // Delete old embeddings if we have the old path
                        if (item.from) {
                            const normalizedOldPath = normalizeRel(item.from);
                            await deletePointsByPath(normalizedOldPath);
                            console.log(`🔄 Deleted old embeddings for moved file: ${normalizedOldPath}`);
                        }

                        // Re-index at new location (if it's a textual asset)
                        if (item.kind && (item.kind === "MonoScript" || item.kind === "TextAsset")) {
                            await this.indexTextualItems([item as { guid: string; path: string; kind: string }], evt, evt.ts);
                            console.log(`🔄 Re-indexed moved file at new location: ${item.path}`);
                        }
                    } catch (error) {
                        console.error(`❌ Failed to handle move for ${item.path}:`, error);
                    }
                }
                break;
            }

            case "assets_deleted": {
                const deletedItems = (evt.body.items as Array<{ guid: string; path: string }>) ?? [];

                // 1) Mark as deleted in SQLite
                markDeleted(this.db, deletedItems, evt.ts);

                // 2) Clean up Qdrant vector store
                for (const item of deletedItems) {
                    try {
                        // Delete by path (primary method)
                        if (item.path) {
                            const normalizedPath = normalizeRel(item.path);
                            await deletePointsByPath(normalizedPath);
                            console.log(`🗑️ Deleted vector embeddings for path: ${normalizedPath}`);
                        }

                        // Also delete by GUID as backup (in case path-based deletion missed anything)
                        if (item.guid) {
                            await deletePointsByGuid(item.guid);
                            console.log(`🗑️ Deleted vector embeddings for GUID: ${item.guid}`);
                        }
                    } catch (error) {
                        console.error(`❌ Failed to delete embeddings for ${item.path || item.guid}:`, error);
                    }
                }
                break;
            }

            case "scene_saved": {
                const sceneGuid = evt.body.guid as string;
                const scenePath = evt.body.path as string;
                upsertScene(this.db, { guid: sceneGuid, path: scenePath, ts: evt.ts });
                await this.indexScene(scenePath, evt, evt.ts);
                break;
            }

            // project_changed, will_save_assets, compile_* → we just log
        }
    };

    private async indexTextualItems(items: Array<{ kind: string; path: string }>, evt: { body: Record<string, unknown>; session?: string }, ts: number) {
        const textual = items.filter((x) => x.kind === "MonoScript" || x.kind === "TextAsset");
        for (const it of textual) {
            await this.indexScript(it.path, evt, ts);
        }
    }

    private async indexScript(relPath: string, evt: { body: Record<string, unknown>; session?: string }, ts: number) {
        // 0) Remove stale vectors for this file first (handles edits cleanly)
        const normalizedPath = normalizeRel(relPath);
        await deletePointsByPath(normalizedPath); // ?wait=true is already in your helper
        
        const abs = this.resolveAbsFrom(evt, relPath);
        const text = await this.readFileWithRetry(abs);
        const chunks = await this.chunkText(text, abs, "Script");
        const vectors = await this.embedder.embed(chunks.map(c => c.text));
        
        // Belt-and-suspenders guard: ensure vectors are valid before reaching Qdrant
        if (vectors.length !== chunks.length || vectors.some(v => v.length !== this.embedder.dim)) {
            throw new Error(`[embedding] invalid shape for ${normalizedPath}: expected ${chunks.length} vectors of dim ${this.embedder.dim}, got ${vectors.length} vectors with dims [${vectors.map(v => v.length).join(', ')}]`);
        }
        if (vectors.some(v => v.every(x => Math.abs(x) < 1e-12))) {
            throw new Error(`[embedding] zero vectors detected for ${normalizedPath}: embeddings contain all-zero or near-zero vectors`);
        }
        
        const points = chunks.map((c, i) => ({
            id: c.id,
            vector: vectors[i],
            payload: {
                rel_path: normalizedPath,
                range: `${c.line_start}-${c.line_end}`,
                file_hash: c.hash,
                kind: "Script",
                session: evt.session,
                updated_ts: ts,
                text: c.text
            }
        }));
        await upsertPoints(points);
    }

    private async indexScene(relPath: string, evt: { body: Record<string, unknown>; session?: string }, ts: number) {
        // 0) Remove stale vectors for this file first (handles edits cleanly)
        const normalizedPath = normalizeRel(relPath);
        await deletePointsByPath(normalizedPath); // ?wait=true is already in your helper
        
        const abs = this.resolveAbsFrom(evt, relPath);
        const text = await this.readFileWithRetry(abs);
        const chunks = await this.chunkText(text, abs, "Scene", 700, 30);
        const vectors = await this.embedder.embed(chunks.map(c => c.text));
        
        // Belt-and-suspenders guard: ensure vectors are valid before reaching Qdrant
        if (vectors.length !== chunks.length || vectors.some(v => v.length !== this.embedder.dim)) {
            throw new Error(`[embedding] invalid shape for ${normalizedPath}: expected ${chunks.length} vectors of dim ${this.embedder.dim}, got ${vectors.length} vectors with dims [${vectors.map(v => v.length).join(', ')}]`);
        }
        if (vectors.some(v => v.every(x => Math.abs(x) < 1e-12))) {
            throw new Error(`[embedding] zero vectors detected for ${normalizedPath}: embeddings contain all-zero or near-zero vectors`);
        }
        
        const points = chunks.map((c, i) => ({
            id: c.id,
            vector: vectors[i],
            payload: {
                rel_path: normalizedPath,
                range: `${c.line_start}-${c.line_end}`,
                file_hash: c.hash,
                kind: "Scene",
                session: evt.session,
                updated_ts: ts,
                text: c.text
            }
        }));
        await upsertPoints(points);
    }
}
