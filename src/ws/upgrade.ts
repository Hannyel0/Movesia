// src/ws/upgrade.ts
import { createServer, type IncomingMessage } from "http";
import { WebSocketServer } from "ws";

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

            if (!opts.tokenValidation(token)) {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req as IncomingMessage);
            });
        } catch {
            socket.destroy();
        }
    });

    return server;
}
