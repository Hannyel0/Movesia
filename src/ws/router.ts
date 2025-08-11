// src/ws/router.ts
import type { MovesiaMessage, ExtendedWebSocket, BroadcastMessage } from "./types";
import type { WebSocket } from "ws";
import { sendToUnity } from "./transport";
import { findByProductGuid } from "../main/unity-project-scanner";
import { reconcile, type ManifestItem } from "../main/reconcile";
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

// Manifest handling state
let manifestPending: ManifestItem[] = [];
let manifestExpecting = 0;
let currentProjectRoot: string | null = null;

// Helper functions
const normGuid = (s?: string) => s?.replace(/-/g, "").toLowerCase();
const rootFromDataPath = (dp?: string) =>
    dp && /[\\/](Assets)[\\/]?$/i.test(dp) ? path.resolve(dp, "..") : undefined;

export class MessageRouter {
    private dbWritesPaused = false;
    private pendingDbMessages: MovesiaMessage[] = [];

    constructor(
        private suspend: SuspendFn, 
        private onDomainEvent?: (msg: MovesiaMessage) => void,
        private sendToUnityCallback?: (message: BroadcastMessage) => void
    ) { }

    /**
     * Handle robust Unity handshake and establish session-to-root mapping
     */
    private async handleHello(sess: string, msg: MovesiaMessage, body: HelloBody): Promise<void> {

        // 1) Try to match by productGUID (authoritative)
        const pg = normGuid(body.productGUID);
        let root = pg ? await findByProductGuid(pg) : undefined;

        // 2) Fallback: derive from dataPath (<project>/Assets)
        if (!root) {
            root = rootFromDataPath(body.dataPath);
        }

        if (!root) {
            return; // keep buffering until we learn it
        }

        sessionRoot.set(sess, root);

        // Make the hello deliver the resolved root to main:
        const helloWithRoot = { ...msg, _sessionRoot: root };

        // Important: call onDomainEvent with the augmented message
        this.onDomainEvent?.(helloWithRoot);

        // Request manifest from Unity after successful hello
        this.requestManifest();

        // 3) Flush buffered events
        const q = pending.get(sess) ?? [];
        pending.delete(sess);

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
    }

    /**
     * Route domain events with established session root
     */
    private async routeWithRoot(_sess: string, root: string, msg: MovesiaMessage): Promise<void> {
        // Handle manifest events
        if (this.handleManifestEvent(msg, root)) {
            return; // Manifest event handled, don't pass to onDomainEvent
        }

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
                await this.handleHello(sess, msg, msg.body as HelloBody);
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

    private sendAck(ws: ExtendedWebSocket, msgId: string) {
        const ack = { v: 1, source: "electron", type: "ack", ts: Math.floor(Date.now() / 1000), id: msgId };
        ws.send(JSON.stringify(ack));
    }

    /**
     * Request manifest from Unity
     */
    private requestManifest() {
        try {
            if (!this.sendToUnityCallback) {
                console.warn("Cannot request manifest: no Unity connection callback available");
                return;
            }

            const message: BroadcastMessage = {
                type: "manifest:request",
                body: {}
            };
            
            this.sendToUnityCallback(message);
            console.log("📤 Requested manifest from Unity");
        } catch (err) {
            console.error("Failed to request manifest:", err);
        }
    }

    /**
     * Handle manifest-related events from Unity
     */
    private handleManifestEvent(msg: MovesiaMessage, root: string): boolean {
        switch (msg.type) {
            case "manifest_begin":
                manifestPending = [];
                manifestExpecting = (msg.body as any)?.total ?? 0;
                currentProjectRoot = root;
                console.log(`📦 Manifest begin: expecting ${manifestExpecting} items`);
                return true;

            case "manifest_batch":
                const batch = (msg.body as any)?.items ?? [];
                manifestPending.push(...batch);
                const progress = manifestPending.length;
                console.log(`📦 Manifest batch: ${progress}/${manifestExpecting} items`);
                return true;

            case "manifest_end":
                const total = (msg.body as any)?.total ?? manifestPending.length;
                console.log(`📦 Manifest complete: ${total} items received`);

                if (currentProjectRoot) {
                    // Run reconciliation
                    reconcile(currentProjectRoot, manifestPending)
                        .then(stats => {
                            console.log(`✅ Reconcile complete:`, stats);
                            // TODO: Send reconcile results to renderer if needed
                            // getMainWindow()?.webContents.send('reconcile:done', { 
                            //     project: { path: currentProjectRoot }, 
                            //     stats 
                            // });
                        })
                        .catch(err => {
                            console.error("❌ Reconcile failed:", err);
                            // TODO: Send error to renderer if needed
                            // getMainWindow()?.webContents.send('reconcile:error', { 
                            //     error: String(err) 
                            // });
                        });
                }

                // Reset state
                manifestPending = [];
                manifestExpecting = 0;
                currentProjectRoot = null;
                return true;

            default:
                return false; // Not a manifest event
        }
    }

    /**
     * Pause database writes - queue messages instead of processing them
     */
    async pauseDbWrites(): Promise<void> {
        this.dbWritesPaused = true;
        // Wait for any in-flight operations to complete
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    /**
     * Resume database writes - process queued messages
     */
    resumeDbWrites(): void {
        this.dbWritesPaused = false;
        
        // Process all pending messages
        const messages = [...this.pendingDbMessages];
        this.pendingDbMessages = [];
        
        for (const msg of messages) {
            // Process messages that would normally trigger DB writes
            this.onDomainEvent?.(msg);
        }
    }
}
