// src/ws/router.ts
import type { MovesiaMessage, ExtendedWebSocket } from "./types";
import type { WebSocket } from "ws";
import { sendToUnity } from "./transport";
import { findByProductGuid } from "../main/unity-project-scanner";
import path from "node:path";

export type SuspendFn = (ms: number) => void;

type HelloBody = {
    productGUID?: string;
    cloudProjectId?: string;
    unityVersion?: string;
    dataPath?: string;
};

// Session management for robust handshake
const sessionRoot = new Map<string, string>();
const pending = new Map<string, MovesiaMessage[]>();

// Helper functions
const normGuid = (s?: string) => s?.replace(/-/g, "").toLowerCase();
const rootFromDataPath = (dp?: string) =>
    dp && /[\\/](Assets)[\\/]?$/i.test(dp) ? path.resolve(dp, "..") : undefined;

export class MessageRouter {
    constructor(private suspend: SuspendFn, private onDomainEvent?: (msg: MovesiaMessage) => void) { }

    /**
     * Handle robust Unity handshake and establish session-to-root mapping
     */
    private async handleHello(sess: string, body: HelloBody): Promise<void> {
        console.log(`🤝 Processing hello from session [${sess}]`, {
            productGUID: body.productGUID?.substring(0, 8) + "...",
            unityVersion: body.unityVersion,
            hasDataPath: !!body.dataPath
        });

        // 1) Try to match by productGUID (authoritative)
        const pg = normGuid(body.productGUID);
        let root = pg ? await findByProductGuid(pg) : undefined;

        // 2) Fallback: derive from dataPath (<project>/Assets)
        if (!root) {
            root = rootFromDataPath(body.dataPath);
            if (root) {
                console.log(`📁 Using dataPath fallback for session [${sess}]: ${root}`);
            }
        } else {
            console.log(`🎯 Found project by productGUID for session [${sess}]: ${root}`);
        }

        if (!root) {
            console.warn(`⚠️ Could not determine project root for session [${sess}] - keeping buffered`);
            return; // keep buffering until we learn it
        }

        sessionRoot.set(sess, root);
        console.log(`✅ Session [${sess}] mapped to root: ${root}`);

        // 3) Flush buffered events
        const q = pending.get(sess) ?? [];
        pending.delete(sess);
        console.log(`📤 Flushing ${q.length} buffered events for session [${sess}]`);

        for (const evt of q) {
            await this.routeWithRoot(sess, root, evt);
        }
    }

    /**
     * Buffer events for sessions that haven't completed handshake
     */
    private buffer(sess: string, msg: MovesiaMessage): void {
        if (!pending.has(sess)) {
            pending.set(sess, []);
        }
        pending.get(sess)!.push(msg);
        console.log(`📥 Buffered ${msg.type} for session [${sess}] (${pending.get(sess)!.length} total)`);
    }

    /**
     * Route domain events with established session root
     */
    private async routeWithRoot(sess: string, root: string, msg: MovesiaMessage): Promise<void> {
        // Add root context to the message for indexer
        const enrichedMsg = {
            ...msg,
            _sessionRoot: root
        };


        this.onDomainEvent?.(enrichedMsg);
    }

    async handleUnityMessage(ws: ExtendedWebSocket, data: WebSocket.RawData) {
        ws.isAlive = true; ws.missed = 0; ws.lastSeen = Date.now();

        let text: string;
        if (Buffer.isBuffer(data)) text = data.toString("utf8");
        else if (data instanceof ArrayBuffer) text = Buffer.from(data).toString("utf8");
        else if (Array.isArray(data)) text = Buffer.concat(data).toString("utf8");
        else text = String(data);

        let msg: MovesiaMessage;
        try { msg = JSON.parse(text); } catch { console.warn(`⚠️ Bad JSON [${ws.cid}]`); return; }
        if (!this.isMovesiaMessage(msg)) { console.warn(`⚠️ Invalid envelope [${ws.cid}]`); return; }

        if (typeof msg.session === "string") ws.session = msg.session;

        // Handle messages through robust handshake system
        await this.onDomainEventInternal(msg, { sessionFromQuery: ws.sessionFromQuery });

        // Handle compilation events (suspend heartbeat)
        switch (msg.type) {
            case "compile_started":
                this.suspend(120_000); // 2m
                break;
            case "compile_finished":
                this.suspend(30_000);  // 30s
                break;
        }

        if (this.shouldAck(msg.type)) this.sendAck(ws, msg.id);
    }

    private isMovesiaMessage(x: unknown): x is MovesiaMessage {
        if (!x || typeof x !== "object" || x === null) return false;

        const obj = x as Record<string, unknown>;
        return typeof obj.v === "number"
            && typeof obj.source === "string"
            && typeof obj.type === "string"
            && typeof obj.ts === "number"
            && typeof obj.id === "string"
            && "body" in obj;
    }

    /**
     * Main domain event handler with robust handshake support
     */
    public async onDomainEventInternal(msg: MovesiaMessage, ctx: { sessionFromQuery?: string } = {}): Promise<void> {
        const sess = msg.session || ctx.sessionFromQuery || "default";

        try {
            if (msg.type === "hello") {
                await this.handleHello(sess, msg.body as HelloBody);
                return;
            }

            if (msg.type === "hb" || msg.type === "ack") {
                return;
            }

            const root = sessionRoot.get(sess);
            if (!root) {
                this.buffer(sess, msg); // race-proof buffering
                return;
            }

            await this.routeWithRoot(sess, root, msg); // -> indexer
        } catch (err) {
            console.error("onDomainEvent error:", err); // avoid unhandled rejections
        }
    }

    private shouldAck(type: string): boolean {
        return type === "assets_imported" || type === "assets_deleted" || type === "assets_moved" ||
            type === "scene_saved" || type === "project_changed" ||
            type === "compile_started" || type === "compile_finished" ||
            type === "will_save_assets" || type === "hello";
    }

    private sendAck(ws: WebSocket, messageId: string) {
        sendToUnity(ws, { type: "ack", body: { ok: true, id: messageId, timestamp: new Date().toISOString() } });
    }
}
