// src/ws/transport.ts
import type { BroadcastMessage, MovesiaMessage } from "./types";
import type { WebSocket } from "ws";

export function sendToUnity(ws: WebSocket, message: BroadcastMessage) {
    const envelope: MovesiaMessage = {
        v: 1,
        source: "electron",
        type: message.type,
        ts: Math.floor(Date.now() / 1000),
        id: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        body: message.body
    };
    ws.send(JSON.stringify(envelope));
}
