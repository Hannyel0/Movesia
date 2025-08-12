// scripts/wipe-db.ts
import { openMovesiaDB, closeMovesiaDB } from "./sqlite";
import { pauseAllDbWriters, resumeAllDbWriters } from "../orchestrator";
import { waitQdrantReady, dropCollection, createCollection, ensurePayloadIndex } from "../memory/qdrant";

const DIM = 384; // your embedding size

export async function wipeDatabase(): Promise<{ success: boolean; message: string }> {
  await pauseAllDbWriters();
  try {
    // --- QDRANT FIRST ---
    await waitQdrantReady().catch(() => {/* if Qdrant is down, we'll just wipe SQLite */});
    try {
      await dropCollection();               // safest wipe
      await createCollection(DIM);          // recreate with on_disk_payload: false
      await ensurePayloadIndex("rel_path", "keyword"); // if you filter on it
      await ensurePayloadIndex("guid", "keyword");
    } catch (e) {
      console.warn("Qdrant wipe skipped/failed:", (e as Error).message);
    }

    // --- SQLITE NEXT (your existing code) ---
    const db = openMovesiaDB();
    db.exec("BEGIN IMMEDIATE;");

    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;

    const countsBefore = Object.fromEntries(
      tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number })?.c || 0])
    );

    for (const { name } of tables) {
      db.prepare(`DELETE FROM "${name}";`).run();
      try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?;`).run(name); } catch {}
    }
    db.exec("COMMIT;");
    closeMovesiaDB();

    const maintenance = openMovesiaDB();
    try {
      maintenance.pragma("wal_checkpoint(TRUNCATE)"); // trims WAL
      maintenance.exec("VACUUM;");                   // rebuilds db file
    } finally {
      closeMovesiaDB();
    }

    const message = `Wipe complete. Tables cleared: ${Object.entries(countsBefore)
      .map(([name, count]) => `${name}(${count}→0)`)
      .join(", ")}`;

    return { success: true, message };
  } catch (err) {
    try { openMovesiaDB().exec("ROLLBACK;"); } catch {}
    closeMovesiaDB();
    return { success: false, message: `Failed: ${(err as Error).message}` };
  } finally {
    await resumeAllDbWriters();
  }
}
