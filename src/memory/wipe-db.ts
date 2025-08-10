// scripts/wipe-db.ts
import { openMovesiaDB } from "./sqlite";

export function wipeDatabase(): { success: boolean; message: string } {
  const db = openMovesiaDB();
  try {
    // Ensure nobody else writes while we wipe
    db.pragma("locking_mode = EXCLUSIVE");
    db.pragma("foreign_keys = OFF");

    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;

    if (tables.length === 0) {
      db.close();
      return { success: true, message: "No tables found to wipe." };
    }

    const countsBefore = Object.fromEntries(
      tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number })?.c || 0])
    );

    const wipe = db.transaction(() => {
      for (const { name } of tables) {
        // Hard delete table contents
        db.prepare(`DELETE FROM "${name}";`).run();
        // Reset AUTOINCREMENT if present
        try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?;`).run(name); } catch {}
      }
    });
    wipe();

    // Checkpoint WAL and vacuum to reclaim space
    try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
    try { db.exec("VACUUM;"); } catch {}

    db.pragma("foreign_keys = ON");

    const countsAfter = Object.fromEntries(
      tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number })?.c || 0])
    );

    db.close();

    const report = Object.keys(countsBefore)
      .map(t => `${t}: ${countsBefore[t]} → ${countsAfter[t]}`)
      .join(", ");

    return { success: true, message: `Wipe complete. Rows per table: ${report}` };
  } catch (err) {
    try { db.close(); } catch {}
    return { success: false, message: `Failed: ${(err as Error).message}` };
  }
}
