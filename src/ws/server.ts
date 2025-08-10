// server.ts
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server as HttpServer } from "http";
import { createHttpAndBindUpgrade } from "./upgrade";
import { SessionManager } from "./sessions";
import { HeartbeatManager } from "./heartbeat";
import { MessageRouter } from "./router";
import type { ExtendedWebSocket, WebSocketServerConfig } from "./types";
import { sendToUnity } from "./transport";

export class MovesiaWebSocketServer {
    // declare only
    private wss!: WebSocketServer;
    private server!: HttpServer;
    private sessions!: SessionManager;
    private heartbeat!: HeartbeatManager;
    private router!: MessageRouter;
    private cfg!: Required<WebSocketServerConfig>;
    private listening = false;

    constructor(config: WebSocketServerConfig) {
        // 1) set cfg first
        this.cfg = {
            tokenValidation: (t?: string) =>
                typeof t === "string" && (t.length > 8 || t === "REPLACE_ME"),
            onConnectionChange: () => { },
            onDomainEvent: () => { },
            ...config,
        };

        // 2) now it's safe to create deps that use cfg
        this.wss = new WebSocketServer({ noServer: true });
        this.server = createHttpAndBindUpgrade(this.wss, {
            port: this.cfg.port,
            tokenValidation: this.cfg.tokenValidation,
        });

        this.sessions = new SessionManager();
        this.heartbeat = new HeartbeatManager(this.wss);
        this.router = new MessageRouter(
            (ms) => this.heartbeat.suspend(ms),
            this.cfg.onDomainEvent
        );
    }

    public async start(): Promise<void> {
        if (this.listening) return;
        await new Promise<void>((resolve, reject) => {
            this.server.listen(this.cfg.port, () => {
                this.listening = true;
                console.log(`🚀 Movesia WebSocket server listening on :${this.cfg.port}`);
                resolve();
            });
            this.server.on("error", reject);
        });

        this.wss.on("connection", (ws, req) => this.onConnection(ws, req as IncomingMessage));
    }

    public async stop() {
        this.heartbeat.stop();
        await new Promise<void>((resolve) => {
            this.wss.close(() => {
                this.server.close(() => resolve());
            });
        });
    }

    private onConnection(ws: WebSocket, req: IncomingMessage) {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        const session = url.searchParams.get("session") ?? "default";
        const conn = Number(url.searchParams.get("conn") ?? "0") || 0;
        const cid = Math.random().toString(36).slice(2, 8);

        const ex = ws as ExtendedWebSocket;
        ex.cid = cid; ex.session = session; ex.isAlive = true; ex.missed = 0; ex.lastSeen = Date.now();

        const decision = this.sessions.accept(session, conn, ex);
        if (!decision.accept) {
            ws.close(4001, "duplicate session");
            return;
        }
        if (decision.supersede && decision.supersede.readyState === WebSocket.OPEN) {
            decision.supersede.close(4001, "superseded");
        }

        ws.on("error", (err) => console.error(`WS error [${cid}]`, err));
        ws.on("pong", () => { ex.isAlive = true; ex.missed = 0; ex.lastSeen = Date.now(); });
        ws.on("message", (data) => this.router.handleUnityMessage(ex, data));

        ws.on("close", () => {
            this.sessions.clearIfMatch(session, ex);
            this.cfg.onConnectionChange?.(this.wss.clients.size > 0);
        });

        this.heartbeat.start();
        this.cfg.onConnectionChange?.(true);

        sendToUnity(ex, { type: "welcome", body: { message: "Connected to Movesia Electron" } });
    }
}
