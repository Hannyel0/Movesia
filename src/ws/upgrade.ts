// src/ws/upgrade.ts
import { createServer, type IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import type { ExtendedWebSocket } from "./types";

// Track active connections per session for monotonic takeover
const activeConnections = new Map<string, ExtendedWebSocket>();

export function createHttpAndBindUpgrade(
    wss: WebSocketServer,
    opts: {
        port: number;
        tokenValidation: (token?: string) => boolean;
    }
) {
    const server = createServer();

    server.on("upgrade", (req, socket, head) => {
        try {
            // URL is global in Node; no import needed
            const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
            const token = url.searchParams.get("token") ?? undefined;
            const session = url.searchParams.get("session") ?? undefined;
            const connSeq = parseInt(url.searchParams.get("conn") ?? "0", 10);

            if (!opts.tokenValidation(token)) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }

            // Monotonic takeover: reject older connections for the same session
            if (session) {
                const existing = activeConnections.get(session);
                if (existing && existing.connSeq !== undefined && connSeq <= existing.connSeq) {
                    console.log(`🚫 Rejecting older connection [${session}] conn=${connSeq} (current=${existing.connSeq})`);
                    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
                    socket.destroy();
                    return;
                }

                // Close existing connection (superseded)
                if (existing && existing.readyState === existing.OPEN) {
                    console.log(`🔄 Superseding connection [${session}] conn=${existing.connSeq} -> ${connSeq}`);
                    existing.close(4001, "superseded"); // Custom close code
                }
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                const extWs = ws as ExtendedWebSocket;
                extWs.sessionFromQuery = session;
                extWs.connSeq = connSeq;

                // Track this connection
                if (session) {
                    activeConnections.set(session, extWs);
                    
                    // Clean up on close
                    extWs.on('close', () => {
                        if (activeConnections.get(session) === extWs) {
                            activeConnections.delete(session);
                            console.log(`🧹 Cleaned up connection tracking for session [${session}]`);
                        }
                    });
                }

                console.log(`✅ Accepted connection [${session}] conn=${connSeq}`);
                wss.emit("connection", ws, req as IncomingMessage);
            });
        } catch (error) {
            console.error("Upgrade error:", error);
            socket.destroy();
        }
    });

    return server;
}
