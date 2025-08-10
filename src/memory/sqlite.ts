// memory/sqlite.ts
// deps: npm i better-sqlite3
import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";

export type DomainEvent = {
    ts: number;                 // unix seconds
    session?: string | null;
    type: string;
    body: Record<string, unknown>;
};

export function openMovesiaDB() {
    const dir = app.getPath("userData"); // per-user app data dir (Electron)
    const db = new Database(path.join(dir, "movesia.db"));
    db.pragma("journal_mode = WAL");     // SQLite WAL = better concurrency
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      session TEXT,
      type TEXT NOT NULL,
      body TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets(
      guid TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      kind TEXT,
      mtime INTEGER,
      size INTEGER,
      hash TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS asset_deps(
      guid TEXT NOT NULL,
      dep  TEXT NOT NULL,
      PRIMARY KEY (guid, dep)
    );
    CREATE TABLE IF NOT EXISTS scenes(
      guid TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      updated_ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts   ON events(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(path);
  `);

    return db;
}

export function logEvent(db: Database.Database, evt: DomainEvent) {
    db.prepare(
        `INSERT INTO events(ts, session, type, body) VALUES (@ts, @session, @type, @body)`
    ).run({
        ts: evt.ts,
        session: evt.session ?? null,
        type: evt.type,
        body: JSON.stringify(evt.body ?? {}),
    });
}

export function upsertAssets(db: Database.Database, items: Array<{ guid?: string; GUID?: string; id?: string; path?: string; kind?: string; mtime?: number; size?: number; hash?: string; sha256?: string; deps?: string[] }>, ts: number) {
    const upsert = db.prepare(`
    INSERT INTO assets(guid, path, kind, mtime, size, hash, deleted, updated_ts)
    VALUES (@guid, @path, @kind, @mtime, @size, @hash, 0, @ts)
    ON CONFLICT(guid) DO UPDATE SET
      path=excluded.path, 
      kind=COALESCE(excluded.kind, assets.kind),
      mtime=COALESCE(excluded.mtime, assets.mtime), 
      size=COALESCE(excluded.size, assets.size), 
      hash=COALESCE(excluded.hash, assets.hash),
      deleted=0, updated_ts=excluded.updated_ts
  `);
    const upsertDep = db.prepare(`INSERT OR IGNORE INTO asset_deps(guid, dep) VALUES (?, ?)`);
    const tx = db.transaction((rows: any[]) => {
        for (const it of rows) {
            const row = {
                guid: it.guid ?? it.GUID ?? it.id,                          // required
                path: typeof it.path === "string" ? it.path : "(unknown)",  // required
                kind: typeof it.kind === "string" ? it.kind : null,
                mtime: Number.isFinite(it.mtime) ? it.mtime : null,
                size:  Number.isFinite(it.size)  ? it.size  : null,
                // 🔑 ensure the 'hash' key always exists; map from sha256 if present
                hash:  typeof it.sha256 === "string"
                         ? it.sha256
                         : (typeof it.hash === "string" ? it.hash : null),
                ts
            };
            if (!row.guid || !row.path) continue; // skip clearly bad rows
            upsert.run(row);

            const deps: string[] = Array.isArray(it.deps) ? it.deps : [];
            for (const d of deps.slice(0, 200)) upsertDep.run(row.guid, d);
        }
    });
    tx(items);
}

export function markDeleted(db: Database.Database, items: Array<{ guid: string }>, ts: number) {
    const stmt = db.prepare(`UPDATE assets SET deleted=1, updated_ts=@ts WHERE guid=@guid`);
    const tx = db.transaction(() => {
        for (const it of items) stmt.run({ guid: it.guid, ts });
    });
    tx();
}

export function upsertScene(db: Database.Database, scene: { guid: string; path: string; ts: number }) {
    db.prepare(`
    INSERT INTO scenes(guid, path, updated_ts)
    VALUES (@guid, @path, @ts)
    ON CONFLICT(guid) DO UPDATE SET path=excluded.path, updated_ts=excluded.updated_ts
  `).run(scene);
}
