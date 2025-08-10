// orchestrator.ts
import { openMovesiaDB } from "./memory/sqlite";
import { Indexer } from "./memory/indexer";
import { ensureQdrantRunning } from "./memory/qdrant/ensure";
import { ensureCollection } from "./memory/qdrant";

// Singleton guard for idempotent startup
let bootPromise: Promise<{ db: any; indexer: Indexer }> | null = null;

const embedder = {
  dim: 384,
  async embed(texts: string[]) {
    // TEMP: return zero vectors so pipeline runs without crashing
    // Replace with real embeddings ASAP (dim must match your collection).
    // Qdrant expects point vectors to match collection size.
    return texts.map(() => Array(384).fill(0));
  }
};

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
