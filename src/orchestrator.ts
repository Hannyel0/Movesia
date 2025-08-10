// orchestrator.ts
import { openMovesiaDB } from "./memory/sqlite";
import { Indexer } from "./memory/indexer";
import { ensureQdrantRunning } from "./memory/qdrant/ensure";
import { ensureCollection } from "./memory/qdrant";
import { LocalEmbedder } from "./memory/embedder";
import type Database from "better-sqlite3";

// Singleton guard for idempotent startup
let bootPromise: Promise<{ db: Database.Database; indexer: Indexer }> | null = null;

const embedder = new LocalEmbedder();

export async function startServices() {
  console.log("🚀 Starting Movesia services...");

  // 1) SQLite (documented app data path)
  const db = openMovesiaDB(); // uses app.getPath('userData'), recommended by Electron.
  console.log("✅ SQLite ready");

  // 2) Qdrant up
  try {
    await ensureQdrantRunning();                           // waits /readyz (200) before continuing.
    await ensureCollection(embedder.dim);                  // idempotent create (vectors.size must match embeds).
    console.log("✅ Qdrant collection ready");
  } catch (e) {
    console.warn("⚠️ Qdrant unavailable, continuing without vectors:", e);
  }

  // 3) Indexer
  const indexer = new Indexer(db, embedder);

  console.log("✅ Core services initialized");
  return { db, indexer };
}

export function startServicesOnce() {
  if (bootPromise) return bootPromise;
  bootPromise = startServices(); // your existing function
  return bootPromise;
}
