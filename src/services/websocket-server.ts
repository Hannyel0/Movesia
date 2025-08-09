// websocket-server.ts
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { URL } from "url";

export interface BroadcastMessage {
    type: string;
    body: Record<string, unknown>;
}

export interface MovesiaMessage {
    v: number;
    source: "unity" | "electron";
    type: string;
    ts: number; // unix seconds
    id: string;
    body: Record<string, unknown>;
    session?: string; // optional, forwarded by unity
}

export interface WebSocketServerConfig {
    port: number;
    tokenValidation?: (token?: string) => boolean;
    onConnectionChange?: (connected: boolean) => void;
}

interface ExtendedWebSocket extends WebSocket {
    cid: string;            // short connection id for logs
    session?: string;       // unity session id (EditorPrefs persisted)
    isAlive: boolean;       // ws heartbeat marker
    missed: number;         // missed pong sweeps
    lastSeen: number;       // Date.now() of last message/pong
    closingSince?: number;  // Date.now() when entered CLOSING (for force kill)
}

export class MovesiaWebSocketServer {
    private server = createServer();
    private wss = new WebSocketServer({ noServer: true });
    private cfg: Required<WebSocketServerConfig>;
    private heartbeatTimer?: NodeJS.Timeout;
    private suspendTerminateUntil = 0; // ms epoch; when > now, don't terminate sockets
    private sessions = new Map<string, { conn: number, ws: ExtendedWebSocket }>(); // session tracking

    constructor(config: WebSocketServerConfig) {
        this.cfg = {
            tokenValidation: (t?: string) =>
                typeof t === "string" && (t.length > 8 || t === "REPLACE_ME"),
            onConnectionChange: () => { },
            ...config,
        };

        this.server.on("upgrade", (req, socket, head) => {
            try {
                const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
                const token = url.searchParams.get("token") ?? undefined;
                if (!this.cfg.tokenValidation(token)) {
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }
                this.wss.handleUpgrade(req, socket, head, (ws) => {
                    this.wss.emit("connection", ws, req);
                });
            } catch {
                socket.destroy();
            }
        });

        this.wss.on("connection", (ws, req) => this.onConnection(ws, req));
        this.wss.on("close", () => this.stopHeartbeatIfIdle());
    }

    // --- Public API ---
    public async start(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.server.listen(this.cfg.port, () => {
                console.log(`🚀 Movesia WebSocket server listening on :${this.cfg.port}`);
                resolve();
            });
            this.server.on("error", reject);
        });
    }

    public async stop(): Promise<void> {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        await new Promise<void>((resolve) => {
            this.wss.close(() => {
                this.server.close(() => {
                    console.log("🛑 WebSocket server stopped");
                    resolve();
                });
            });
        });
    }

    // --- Connection handling ---
    private onConnection(ws: WebSocket, req: import('http').IncomingMessage) {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const session = url.searchParams.get("session") ?? "default";
        const connStr = url.searchParams.get("conn") ?? "0";
        const conn = Number(connStr) || 0;
        const cid = Math.random().toString(36).slice(2, 8);

        const ex = ws as ExtendedWebSocket;
        ex.cid = cid;
        ex.session = session;
        ex.isAlive = true;
        ex.missed = 0;
        ex.lastSeen = Date.now();

        console.log(`🔗 Unity WebSocket attempting connection [${cid}] session=${session} conn=${conn}`);

        // Monotonic connection number validation
        const prev = this.sessions.get(session);
        if (prev && conn <= prev.conn) {
            // Reject older/duplicate connection
            console.log(`❌ Rejecting duplicate/older connection [${cid}] conn=${conn} <= ${prev.conn}`);
            ws.close(4001, "duplicate session");
            return;
        }

        // Newer connection wins: close old if present
        if (prev && prev.ws.readyState === WebSocket.OPEN) {
            console.log(`🔄 Superseding old connection [${prev.ws.cid}] conn=${prev.conn} with new [${cid}] conn=${conn}`);
            prev.ws.close(4001, "superseded");
        }

        // Register the new connection
        this.sessions.set(session, { conn, ws: ex });
        console.log(`✅ Unity WebSocket connected [${cid}] session=${session} conn=${conn}`);

        // mark liveness on any message & on pong
        ws.on("pong", () => this.markAlive(ex, "pong"));
        ws.on("message", (data) => this.handleUnityMessage(ex, data));

        // log close and cleanup session tracking
        ws.on("close", (code, reason) => {
            console.log(`⚠️  Unity WebSocket disconnected [${cid}] code=${code} reason=${reason}`);
            
            // Clean up session tracking if this was the active connection
            const sessionEntry = this.sessions.get(session);
            if (sessionEntry && sessionEntry.ws === ex) {
                this.sessions.delete(session);
                console.log(`🧹 Cleaned up session tracking for ${session}`);
            }
            
            this.cfg.onConnectionChange?.(this.wss.clients.size > 0);
        });

        // start heartbeat sweeper if needed
        this.startHeartbeat();

        // notify renderer if you care
        this.cfg.onConnectionChange?.(true);

        // welcome (no ack, it's server→client)
        this.sendToUnity(ex, { type: "welcome", body: { message: "Connected to Movesia Electron" } });
    }

    private markAlive(ws: ExtendedWebSocket, _via: "pong" | "message") {
        ws.isAlive = true;
        ws.missed = 0;
        ws.lastSeen = Date.now();
        // Uncomment for noisy liveness logs:
        // console.log(`💓 ${_via.toUpperCase()} from [${ws.cid}]`);
    }

    // --- Heartbeat (single global sweeper) ---
    private startHeartbeat() {
        if (this.heartbeatTimer) return;

        const SWEEP_MS = 40_000;      // check every 40s
        const PING_AFTER_MS = 90_000; // only ping if no traffic for >90s
        const MAX_IDLE_MS = 10 * 60_000; // hard kill if no traffic for >10m
        const CLOSING_FORCE_KILL_MS = 10_000;

        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();

            this.wss.clients.forEach((client) => {
                const ws = client as ExtendedWebSocket;

                // Skip/clean non-OPEN sockets and force-terminate stuck CLOSING sockets
                if (client.readyState !== WebSocket.OPEN) {
                    if (client.readyState === WebSocket.CLOSING) {
                        ws.closingSince ??= now;
                        if (now - (ws.closingSince ?? now) > CLOSING_FORCE_KILL_MS) {
                            console.warn(`⛔ Force-terminating [${ws.cid}] stuck in CLOSING > ${CLOSING_FORCE_KILL_MS}ms`);
                            try { client.terminate(); } catch { }
                        }
                    }
                    return; // don't ping/penalize non-OPEN sockets
                }
                ws.closingSince = undefined;

                // Don’t terminate during suspension (compiles/imports).
                if (now < this.suspendTerminateUntil) return;

                const age = now - (ws.lastSeen ?? 0);

                // Truly idle sockets: kill.
                if (age > MAX_IDLE_MS) {
                    console.warn(`⛔ Terminating [${ws.cid}] idle > ${MAX_IDLE_MS}ms`);
                    try { client.terminate(); } catch { }
                    return;
                }

                // If there was traffic recently, trust it and skip ping/missed.
                if (age <= PING_AFTER_MS) {
                    ws.isAlive = true;
                    ws.missed = 0;
                    return;
                }

                // No traffic for a while → use ping/pong fallback.
                if (ws.isAlive === false) {
                    ws.missed = (ws.missed ?? 0) + 1;
                    if (ws.missed >= 3) {
                        console.warn(`⛔ Terminating [${ws.cid}] after ${ws.missed} missed pongs`);
                        try { client.terminate(); } catch { }
                        return;
                    }
                } else {
                    ws.missed = 0;
                }

                ws.isAlive = false; // request proof-of-life for next sweep
                try {
                    client.ping();
                    // console.log(`📡 Pinging [${ws.cid}] (age=${Math.round(age / 1000)}s)`);
                } catch (e) {
                    console.warn(`Ping failed for [${ws.cid}]:`, e);
                    try { client.terminate(); } catch { }
                }
            });

            this.stopHeartbeatIfIdle();
        }, SWEEP_MS);
    }

    private stopHeartbeatIfIdle() {
        if (this.wss.clients.size === 0 && this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }

    // --- Message handling ---
    private handleUnityMessage(ws: ExtendedWebSocket, data: WebSocket.RawData) {
        this.markAlive(ws, "message");

        let text: string;
        try {
            if (Buffer.isBuffer(data)) text = data.toString("utf8");
            else if (data instanceof ArrayBuffer) text = Buffer.from(data).toString("utf8");
            else if (Array.isArray(data)) text = Buffer.concat(data).toString("utf8");
            else text = String(data);
        } catch {
            return;
        }

        let msg: MovesiaMessage | null = null;
        try {
            msg = JSON.parse(text);
        } catch {
            console.warn(`⚠️ Bad JSON from [${ws.cid}]`);
            return;
        }

        if (!this.isMovesiaMessage(msg)) {
            console.warn(`⚠️ Invalid envelope from [${ws.cid}]`);
            return;
        }

        // optional: stash session into socket if provided
        if (typeof msg.session === "string") ws.session = msg.session;

        // domain routing
        switch (msg.type) {
            case "assets_imported":
            case "assets_deleted":
            case "assets_moved":
                // TODO: forward to your indexer
                break;
            case "scene_saved":
            case "project_changed":
            case "will_save_assets":
                // TODO: forward if needed
                break;
            case "compile_started":
                // suspend termination for 2 minutes
                this.suspendTerminateUntil = Date.now() + 120_000;
                console.log(`⏸️  Suspend terminate: compile started (2m) [${ws.cid}]`);
                break;
            case "compile_finished":
                // 30s cooldown after compile
                this.suspendTerminateUntil = Date.now() + 30_000;
                console.log(`⏸️  Suspend terminate: compile finished (30s) [${ws.cid}]`);
                break;
            case "hb":
                // app-level heartbeat; no ACK
                break;
            default:
                // handle custom commands here if you add them later
                break;
        }

        // ACK only domain events (never ack hb/welcome/ack)
        if (this.shouldAck(msg.type)) {
            this.sendAck(ws, msg.id);
        }
    }

    private isMovesiaMessage(x: unknown): x is MovesiaMessage {
        return x && typeof x === "object" && x !== null
            && typeof (x as Record<string, unknown>).v === "number"
            && typeof (x as Record<string, unknown>).source === "string"
            && typeof (x as Record<string, unknown>).type === "string"
            && typeof (x as Record<string, unknown>).ts === "number"
            && typeof (x as Record<string, unknown>).id === "string"
            && "body" in x;
    }

    private shouldAck(type: string): boolean {
        return type === "assets_imported" || type === "assets_deleted" || type === "assets_moved" ||
            type === "scene_saved" || type === "project_changed" ||
            type === "compile_started" || type === "compile_finished" ||
            type === "will_save_assets";
    }

    private sendAck(ws: WebSocket, messageId: string) {
        this.sendToUnity(ws, { type: "ack", body: { ok: true, id: messageId, timestamp: new Date().toISOString() } });
    }

    private sendToUnity(ws: WebSocket, message: BroadcastMessage) {
        const envelope: MovesiaMessage = {
            v: 1,
            source: "electron",
            type: message.type,
            ts: Math.floor(Date.now() / 1000),
            id: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
            body: message.body,
        };
        ws.send(JSON.stringify(envelope));
    }
}
