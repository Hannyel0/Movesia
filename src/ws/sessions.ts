// src/ws/sessions.ts
import type { ExtendedWebSocket } from "./types";

export class SessionManager {
    private sessions = new Map<string, { conn: number; ws: ExtendedWebSocket }>();

    accept(session: string, conn: number, ws: ExtendedWebSocket): { accept: boolean; supersede?: ExtendedWebSocket } {
        const prev = this.sessions.get(session);
        if (prev && conn <= prev.conn) return { accept: false };

        if (prev) this.sessions.delete(session); // supersede old
        this.sessions.set(session, { conn, ws });
        return { accept: true, supersede: prev?.ws };
    }

    clearIfMatch(session: string, ws: ExtendedWebSocket) {
        const entry = this.sessions.get(session);
        if (entry && entry.ws === ws) this.sessions.delete(session);
    }

    size() { return this.sessions.size; }
}
