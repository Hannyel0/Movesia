// scripts/wipe-db.ts
import { openMovesiaDB, closeMovesiaDB } from "./sqlite";
import { pauseAllDbWriters, resumeAllDbWriters } from "../orchestrator";

export async function wipeDatabase(): Promise<{ success: boolean; message: string }> {
  await pauseAllDbWriters();
  
  try {
    const db = openMovesiaDB();

    // Take the write lock up front
    db.exec("BEGIN IMMEDIATE;");  // prevents other writers from starting

    // Enumerate user tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as Array<{ name: string }>;

    if (tables.length === 0) {
      db.exec("COMMIT;");
      return { success: true, message: "No tables found to wipe." };
    }

    const countsBefore = Object.fromEntries(
      tables.map(({ name }) => [name, (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number })?.c || 0])
    );

    for (const { name } of tables) {
      db.prepare(`DELETE FROM "${name}";`).run();
      // reset AUTOINCREMENT
      try { db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?;`).run(name); } catch {}
    }

    db.exec("COMMIT;");

    // Close the main connection so we can checkpoint/vacuum cleanly
    closeMovesiaDB();

    // Run checkpoint & vacuum on a fresh short-lived connection
    const maintenance = openMovesiaDB();
    try {
      // Try a truncating checkpoint; WAL may still be reused depending on settings
      maintenance.pragma("wal_checkpoint(TRUNCATE)");
      maintenance.exec("VACUUM;");
    } finally {
      closeMovesiaDB();
    }

    const message = `Wipe complete. Tables cleared: ${Object.entries(countsBefore)
      .map(([name, count]) => `${name}(${count}→0)`)
      .join(", ")}`;

    return { success: true, message };
  } catch (err) {
    try { 
      const db = openMovesiaDB();
      db.exec("ROLLBACK;"); 
    } catch {}
    closeMovesiaDB();
    return { success: false, message: `Failed: ${(err as Error).message}` };
  } finally {
    await resumeAllDbWriters();
  }
}
