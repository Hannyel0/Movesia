// src/ws/router.ts
import type { MovesiaMessage, ExtendedWebSocket } from "./types";
import type { WebSocket } from "ws";
import { sendToUnity } from "./transport";

export type SuspendFn = (ms: number) => void;

export class MessageRouter {
    constructor(private suspend: SuspendFn, private onDomainEvent?: (msg: MovesiaMessage) => void) { }

    handleUnityMessage(ws: ExtendedWebSocket, data: WebSocket.RawData) {
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

        switch (msg.type) {
            case "assets_imported":
            case "assets_deleted":
            case "assets_moved":
            case "scene_saved":
            case "project_changed":
            case "will_save_assets":
                this.onDomainEvent?.(msg);
                break;
            case "compile_started":
                this.suspend(120_000); // 2m
                break;
            case "compile_finished":
                this.suspend(30_000);  // 30s
                break;
            case "hb":
                break;
            default:
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

    private shouldAck(type: string): boolean {
        return type === "assets_imported" || type === "assets_deleted" || type === "assets_moved" ||
            type === "scene_saved" || type === "project_changed" ||
            type === "compile_started" || type === "compile_finished" ||
            type === "will_save_assets";
    }

    private sendAck(ws: WebSocket, messageId: string) {
        sendToUnity(ws, { type: "ack", body: { ok: true, id: messageId, timestamp: new Date().toISOString() } });
    }
}
