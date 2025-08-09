// src/ws/types.ts
import type { WebSocket } from "ws";

export interface BroadcastMessage { type: string; body: Record<string, unknown>; }

export interface MovesiaMessage {
    v: number;
    source: "unity" | "electron";
    type: string;
    ts: number;            // unix seconds
    id: string;
    body: Record<string, unknown>;
    session?: string;
}

export interface WebSocketServerConfig {
    port: number;
    tokenValidation?: (token?: string) => boolean;
    onConnectionChange?: (connected: boolean) => void;
}

export interface ExtendedWebSocket extends WebSocket {
    cid: string;
    session?: string;
    isAlive: boolean;
    missed: number;
    lastSeen: number;
    closingSince?: number;
}
