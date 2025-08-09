// orchestrator.ts
import { openMovesiaDB } from "./memory/sqlite";
import { Indexer } from "./memory/indexer";
import { ensureQdrantRunning } from "./memory/qdrant/ensure";
import { ensureCollection } from "./memory/qdrant";
import { MovesiaWebSocketServer } from "./ws"; // your split server

// Provide any embedder that returns embeddings; dim must match your collection
const embedder = {
    dim: 384,
    async embed(_texts: string[]) {
        // TODO: plug FastEmbed or your server-side embedding RPC.
        // Return number[][] with length=texts.length and inner length=dim.
        throw new Error("embed() not implemented");
    }
};

export async function startServices() {
    console.log("🚀 Starting Movesia services...");
    
    // Initialize SQLite database
    const db = openMovesiaDB();
    console.log("✅ SQLite ready");

    // Initialize Qdrant vector database
    try {
        await ensureQdrantRunning();        // <- prints the 🐳 logs you added
        await ensureCollection(384);        // or your model dim
        console.log("✅ Qdrant collection ready");
    } catch (e) {
        console.warn("⚠️ Qdrant unavailable, continuing without vectors:", e);
    }

    // Initialize indexer
    const indexer = new Indexer(db, embedder);
    await indexer.initVectorCollection();

    return { db, indexer };
}

export async function startMovesiaMemory() {
    const { db, indexer } = await startServices();

    const server = new MovesiaWebSocketServer({
        port: 8765,
        tokenValidation: (t: unknown) => typeof t === "string" && t.length > 16,
        onConnectionChange: (_connected: boolean) => { /* update UI if needed */ }
    });

    // Assuming your ws/router calls this on Unity messages:
    // In server.ts, pass indexer.handleUnityEvent to the MessageRouter onDomainEvent callback.
    // Example:
    //   new MessageRouter(suspend, (msg) => indexer.handleUnityEvent({
    //     ts: msg.ts, type: msg.type, session: msg.session, body: msg.body
    //   }));

    await server.start();
}
