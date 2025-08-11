// orchestrator.ts
import { openMovesiaDB } from "./memory/sqlite";
import { Indexer } from "./memory/indexer";
import { ensureQdrantRunning } from "./memory/qdrant/ensure";
import { ensureCollection } from "./memory/qdrant";
import { LocalEmbedder } from "./memory/embedder";
import type Database from "better-sqlite3";

// Type for the router with pause/resume capabilities
export interface RouterWithPause {
  pauseDbWrites(): Promise<void>;
  resumeDbWrites(): void;
}

// Singleton guard for idempotent startup
let bootPromise: Promise<{ db: Database.Database; indexer: Indexer }> | null = null;
let globalIndexer: Indexer | null = null;
let globalRouter: RouterWithPause | null = null; // Will be set from main.ts

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
  globalIndexer = indexer;

  console.log("✅ Core services initialized");
  return { db, indexer };
}

export function startServicesOnce() {
  if (bootPromise) return bootPromise;
  bootPromise = startServices(); // your existing function
  return bootPromise;
}

/**
 * Set the global router reference for pause/resume operations
 */
export function setGlobalRouter(router: RouterWithPause) {
  globalRouter = router;
}

/**
 * Pause all database writers before maintenance operations
 */
export async function pauseAllDbWriters(): Promise<void> {
  console.log("🔒 Entering maintenance mode - pausing all DB writers");
  
  if (globalIndexer) {
    await globalIndexer.pause();
    console.log("  ✅ Indexer paused");
  }
  
  if (globalRouter && typeof globalRouter.pauseDbWrites === 'function') {
    await globalRouter.pauseDbWrites();
    console.log("  ✅ Router DB writes paused");
  }
  
  // Wait a bit more to ensure all in-flight operations complete
  await new Promise(resolve => setTimeout(resolve, 200));
  console.log("🔒 Maintenance mode active");
}

/**
 * Resume all database writers after maintenance operations
 */
export async function resumeAllDbWriters(): Promise<void> {
  console.log("🔓 Exiting maintenance mode - resuming all DB writers");
  
  if (globalRouter && typeof globalRouter.resumeDbWrites === 'function') {
    globalRouter.resumeDbWrites();
    console.log("  ✅ Router DB writes resumed");
  }
  
  if (globalIndexer) {
    await globalIndexer.resume();
    console.log("  ✅ Indexer resumed");
  }
  
  console.log("🔓 Normal operations resumed");
}
