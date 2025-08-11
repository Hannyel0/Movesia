// src/main/reconcile.ts
import { openMovesiaDB, upsertAssets, markDeleted } from "../memory/sqlite";
import { deletePointsByPath } from "../memory/qdrant";
import type { Indexer } from "../memory/indexer";

export type ManifestItem = {
    guid: string;
    path: string;
    kind?: string;
    isFolder?: boolean;
    mtime?: number | null;
    size?: number | null;
    hash?: string | null;
};

export type ReconcileStats = { added: number; deleted: number; moved: number; modified: number; };

let _indexer: Indexer | null = null;
export function configureReconcile(deps: { indexer: Indexer }) { _indexer = deps.indexer; }

const isTextual = (k?: string, p?: string) =>
    k === "MonoScript" || k === "TextAsset" || (typeof p === "string" && p.endsWith(".cs"));
const isScene = (p?: string) => typeof p === "string" && p.endsWith(".unity");
const norm = (p: string) => p.replace(/\\/g, "/"); // Qdrant payload uses forward slashes

export async function reconcile(_projectRoot: string, items: ManifestItem[]): Promise<ReconcileStats> {
    const db = openMovesiaDB();

    // current DB state (live assets; “deleted=0” so we can diff accurately)
    const dbAssets = db.prepare(
        "SELECT guid, path, hash, mtime FROM assets WHERE deleted=0"
    ).all() as Array<{ guid: string; path: string; hash?: string | null; mtime?: number | null }>;

    const byGuid = new Map(dbAssets.map(a => [a.guid, a]));
    const seen = new Set<string>();

    const now = Math.floor(Date.now() / 1000);
    let added = 0, deleted = 0, moved = 0, modified = 0;

    const toUpsert: ManifestItem[] = [];
    const toReindex: ManifestItem[] = [];
    const toMoved: Array<{ guid: string; from: string; path: string; kind?: string }> = [];

    // ADDED / MOVED / MODIFIED (skip folders)
    for (const it of items) {
        if (it.isFolder) continue;
        seen.add(it.guid);
        const row = byGuid.get(it.guid);

        if (!row) {
            toUpsert.push(it);
            if (isTextual(it.kind, it.path) || isScene(it.path)) toReindex.push(it);
            added++;
            continue;
        }

        if (row.path !== it.path) {
            toUpsert.push(it);
            toMoved.push({ guid: it.guid, from: row.path, path: it.path, kind: it.kind });
            // we’ll also reindex textual/scene below
            if (isTextual(it.kind, it.path) || isScene(it.path)) toReindex.push(it);
            moved++;
            continue;
        }

        const changed =
            (row.hash && it.hash && row.hash !== it.hash) ||
            (row.hash == null && typeof it.mtime === "number" && row.mtime !== it.mtime);
        if (changed) {
            // delete old vectors; reindex textual/scene below
            await deletePointsByPath(norm(it.path));
            if (isTextual(it.kind, it.path) || isScene(it.path)) toReindex.push(it);
            modified++;
        }
    }

    // DELETED (present in DB, absent in manifest)
    const deletedRows = dbAssets.filter(row => !seen.has(row.guid));
    if (deletedRows.length) {
        markDeleted(db, deletedRows.map(r => ({ guid: r.guid })), now);
        for (const r of deletedRows) {
            await deletePointsByPath(norm(r.path));
        }
        deleted += deletedRows.length;
    }

    // Persist upserts for added/moved/modified rows
    if (toUpsert.length) {
        upsertAssets(db, toUpsert.map(it => ({
            guid: it.guid, path: it.path, kind: it.kind, mtime: it.mtime, size: it.size, hash: it.hash
        })), now);
    }

    // Tell Indexer to (re)index textual files and scenes
    // We reuse your existing event handlers to avoid duplicating logic.
    if (_indexer && toReindex.length) {
        // Split scenes vs scripts so Indexer routes correctly
        const scripts = toReindex.filter(x => isTextual(x.kind, x.path));
        const scenes = toReindex.filter(x => isScene(x.path));

        if (scripts.length) {
            await _indexer.handleUnityEvent({
                ts: now,
                type: "assets_imported",
                body: { items: scripts.map(s => ({ guid: s.guid, path: s.path, kind: s.kind, mtime: s.mtime, size: s.size, hash: s.hash })) }
            });
        }
        for (const sc of scenes) {
            await _indexer.handleUnityEvent({
                ts: now,
                type: "scene_saved",
                body: { guid: sc.guid, path: sc.path }
            });
        }
    }

    // Move cleanup: delete old vectors for moved files (Indexer's move handler also handles this in live mode)
    for (const mv of toMoved) {
        try {
            await deletePointsByPath(norm(mv.from));
        } catch (e) {
            console.warn("deletePointsByPath(old) failed for moved file:", mv.from, e);
        }
    }

    console.log(`📊 Reconcile complete (write-through): +${added} ~${moved} ±${modified} -${deleted}`);
    return { added, deleted, moved, modified };
}
