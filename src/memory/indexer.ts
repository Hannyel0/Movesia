// memory/indexer.ts
import type Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from 'node:crypto';
import { upsertPoints, deletePointsByPath, deletePointsByGuid } from "./qdrant";
import { logEvent, upsertAssets, markDeleted, upsertScene, writeIndexState } from "./sqlite";
import { makePointIdFromChunkKey } from "./ids";
import { emitStatus, getQdrantPointCount } from "./progress";

export type Embedder = { dim: number; embed(texts: string[]): Promise<number[][]> };

export type UnityEvent = {
    ts: number;
    type: string;
    session?: string;
    body: Record<string, unknown>;
};

type UnityAssetItem = {
    guid: string;
    path: string;
    kind: string;
    hash?: string;
    sha256?: string;
    from?: string;
    deps?: string[];
};

type UnitySceneData = {
    guid: string;
    path: string;
    deps?: string[];
};

function normalizeRel(p: string) {
    // Store a normalized relative path (forward slashes)
    return p.replaceAll("\\", "/");
}

// Helper to compute canonical project ID from root path
export function computeProjectId(root: string): string {
  const normalized = path.normalize(root).replace(/\\/g,"/").replace(/\/+$/,"");
  return createHash("sha256").update(normalized).digest("hex").slice(0,16);
}

// --- Helper: snapshot of current assets ---
export function computeSnapshotFromAssets(db: Database.Database): { sha: string; total: number } {
  const rows = db.prepare(`
    SELECT guid, COALESCE(hash, printf('%d:%d', COALESCE(mtime,0), COALESCE(size,0))) AS ver
    FROM assets
    WHERE deleted = 0
    ORDER BY guid
  `).all() as Array<{ guid: string; ver: string }>;

  const h = createHash('sha256');
  for (const r of rows) h.update(r.guid + ':' + r.ver + '\n');
  return { sha: h.digest('hex'), total: rows.length };
}

export class Indexer {
    private projectRoot: string | null = null;
    private sessionRoots = new Map<string, string>();
    private paused = false;
    private pendingEvents: Array<{ evt: UnityEvent; resolve: () => void; reject: (err: Error) => void }> = [];

    constructor(private db: Database.Database, private embedder: Embedder) { }

    private getProjectId(): string {
        if (!this.projectRoot) {
            throw new Error('Project root not set. Call setProjectRoot() first.');
        }
        return computeProjectId(this.projectRoot);
    }

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
        // If paused, queue the event for later processing
        if (this.paused) {
            return new Promise<void>((resolve, reject) => {
                this.pendingEvents.push({ evt, resolve, reject });
            });
        }

        return this.handleUnityEventInternal(evt);
    };

    private handleUnityEventInternal = async (evt: { ts: number; type: string; session?: string; body: Record<string, unknown> }) => {

        if (evt.type === "hb" || evt.type === "hello" || evt.type === "ack") return;

        logEvent(this.db, evt);

        switch (evt.type) {
            case "assets_imported": {
                const items = (evt.body.items as UnityAssetItem[]) ?? [];
                
                // Normalize hash field (map sha256 → hash)
                const normalized = items.map(it => ({
                    ...it,
                    hash: it.hash ?? it.sha256 ?? null
                }));
                upsertAssets(this.db, normalized, evt.ts);

                // Also mirror .unity files into the 'scenes' table
                for (const it of items) {
                    if (typeof it.path === "string" && it.path.endsWith(".unity") && it.guid) {
                        upsertScene(this.db, { guid: it.guid, path: it.path, ts: evt.ts });
                    }
                }

                // --- NEW: progress for textual items in this batch ---
                const textual = normalized.filter(it => it.kind === "MonoScript" || it.kind === "TextAsset");
                const total = textual.length;

                if (total === 0) {
                    emitStatus({ phase: "complete", total: 0, done: 0, message: "No textual assets in batch" });
                    break;
                }

                emitStatus({ phase: "scanning", total, done: 0, message: "Indexing changed files" });

                let done = 0;
                for (const it of textual) {
                    emitStatus({ phase: "embedding", total, done, lastFile: it.path });
                    await this.indexScript(it.path, evt, evt.ts);
                    done++;
                    emitStatus({ phase: "qdrant", total, done, lastFile: it.path });
                }

                // Optional: confirm DB size (cheap, visible signal)
                const qdrantPoints = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? "movesia");
                emitStatus({ phase: "complete", total, done, qdrantPoints, message: "Up to date" });

                // Persist snapshot for cold start verification
                const { sha, total: totalItems } = computeSnapshotFromAssets(this.db);
                const qdrantCount = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? 'movesia')
                    .catch((): null => null);
                writeIndexState(this.db, {
                    project_id: this.getProjectId(),
                    snapshot_sha: sha,
                    total_items: totalItems,
                    qdrant_count: qdrantCount,
                    completed_at: Math.floor(Date.now() / 1000),
                });
                break;
            }

            case "assets_moved": {
                const items = (evt.body.items as UnityAssetItem[]) ?? [];
                
                // Normalize hash field (map sha256 → hash)
                const normalized = items.map(it => ({
                    ...it,
                    hash: it.hash ?? it.sha256 ?? null
                }));
                
                // 1) Update SQLite with new paths
                upsertAssets(this.db, normalized, evt.ts);

                // Keep scenes table in sync on move
                for (const it of items) {
                    if (typeof it.path === "string" && it.path.endsWith(".unity") && it.guid) {
                        upsertScene(this.db, { guid: it.guid, path: it.path, ts: evt.ts });
                    }
                }

                // 2) Handle Qdrant cleanup and re-indexing
                for (const item of normalized) {
                    try {
                        // Delete old embeddings if we have the old path
                        if (item.from) {
                            const normalizedOldPath = normalizeRel(item.from);
                            await deletePointsByPath(normalizedOldPath);
                            console.log(`🔄 Deleted old embeddings for moved file: ${normalizedOldPath}`);
                        }
                    } catch (error) {
                        console.error(`❌ Failed to handle move for ${item.path}:`, error);
                    }
                }

                // --- NEW: progress for textual items in this batch ---
                const textual = normalized.filter(it => it.kind === "MonoScript" || it.kind === "TextAsset");
                const total = textual.length;

                if (total === 0) {
                    emitStatus({ phase: "complete", total: 0, done: 0, message: "No textual assets moved" });
                    break;
                }

                emitStatus({ phase: "scanning", total, done: 0, message: "Re-indexing moved files" });

                let done = 0;
                for (const item of textual) {
                    try {
                        emitStatus({ phase: "embedding", total, done, lastFile: item.path });
                        await this.indexScript(item.path, evt, evt.ts);
                        done++;
                        emitStatus({ phase: "qdrant", total, done, lastFile: item.path });
                        console.log(`🔄 Re-indexed moved file at new location: ${item.path}`);
                    } catch (error) {
                        console.error(`❌ Failed to re-index moved file ${item.path}:`, error);
                    }
                }

                // Optional: confirm DB size
                const qdrantPoints = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? "movesia");
                emitStatus({ phase: "complete", total, done, qdrantPoints, message: "Moved files re-indexed" });

                // Persist snapshot for cold start verification
                const { sha, total: totalItems } = computeSnapshotFromAssets(this.db);
                const qdrantCount = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? 'movesia')
                    .catch((): null => null);
                writeIndexState(this.db, {
                    project_id: this.getProjectId(),
                    snapshot_sha: sha,
                    total_items: totalItems,
                    qdrant_count: qdrantCount,
                    completed_at: Math.floor(Date.now() / 1000),
                });
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

                // 3) Write snapshot and emit completion status after cleanup
                const { sha, total: totalItems } = computeSnapshotFromAssets(this.db);
                const qdrantCount = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? 'movesia').catch((): null => null);
                writeIndexState(this.db, {
                    project_id: this.getProjectId(),
                    snapshot_sha: sha,
                    total_items: totalItems,
                    qdrant_count: qdrantCount,
                    completed_at: Math.floor(Date.now()/1000),
                });

                // let the UI know we're stable again:
                emitStatus({ phase: "complete", total: 0, done: 0, message: "Deletions applied" });
                break;
            }

            case "scene_saved": {
                const { guid, path, deps = [] } = evt.body as UnitySceneData;
                
                // keep your DB writes
                upsertAssets(this.db, [{ guid, path, kind: "Scene", deps }], evt.ts);
                upsertScene(this.db, { guid, path, ts: evt.ts });

                // NEW: scene progress
                emitStatus({ phase: "scanning", total: 1, done: 0, lastFile: path, message: "Scene changed" });
                emitStatus({ phase: "embedding", total: 1, done: 0, lastFile: path });
                await this.indexScene(path, evt, evt.ts);
                emitStatus({ phase: "qdrant", total: 1, done: 1, lastFile: path });

                const qdrantPoints = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? "movesia");
                emitStatus({ phase: "complete", total: 1, done: 1, qdrantPoints, lastFile: path, message: "Scene indexed" });

                // Persist snapshot for cold start verification
                const { sha, total: totalItems } = computeSnapshotFromAssets(this.db);
                const qdrantCount = await getQdrantPointCount(process.env.QDRANT_COLLECTION ?? 'movesia')
                    .catch((): null => null);
                writeIndexState(this.db, {
                    project_id: this.getProjectId(),
                    snapshot_sha: sha,
                    total_items: totalItems,
                    qdrant_count: qdrantCount,
                    completed_at: Math.floor(Date.now() / 1000),
                });
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

    /**
     * Pause the indexer - queue new events instead of processing them
     */
    async pause(): Promise<void> {
        this.paused = true;
        // Wait for any in-flight operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Resume the indexer - process queued events
     */
    async resume(): Promise<void> {
        this.paused = false;
        
        // Process all pending events
        const events = [...this.pendingEvents];
        this.pendingEvents = [];
        
        for (const { evt, resolve, reject } of events) {
            try {
                await this.handleUnityEventInternal(evt);
                resolve();
            } catch (err) {
                reject(err as Error);
            }
        }
    }

    /**
     * Check if indexer is currently paused
     */
    isPaused(): boolean {
        return this.paused;
    }
}
