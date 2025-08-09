// src/ws/heartbeat.ts
import { WebSocket, WebSocketServer } from "ws";
import type { ExtendedWebSocket } from "./types";

type Now = () => number;

export class HeartbeatManager {
    private timer?: NodeJS.Timeout;
    private suspendUntil = 0;
    constructor(
        private wss: WebSocketServer,
        private now: Now = Date.now
    ) { }

    start() {
        if (this.timer) return;
        const SWEEP_MS = 40_000;
        const PING_AFTER_MS = 90_000;
        const MAX_IDLE_MS = 10 * 60_000;
        const CLOSING_FORCE_KILL_MS = 10_000;

        this.timer = setInterval(() => {
            const now = this.now();

            this.wss.clients.forEach((client) => {
                const ws = client as ExtendedWebSocket;

                if (client.readyState !== WebSocket.OPEN) {
                    if (client.readyState === WebSocket.CLOSING) {
                        ws.closingSince ??= now;
                        if (now - (ws.closingSince ?? now) > CLOSING_FORCE_KILL_MS) {
                            try { client.terminate(); } catch { }
                        }
                    }
                    return;
                }
                ws.closingSince = undefined;

                if (now < this.suspendUntil) return;

                const age = now - (ws.lastSeen ?? 0);
                if (age > MAX_IDLE_MS) { try { client.terminate(); } catch { }; return; }

                if (age <= PING_AFTER_MS) { ws.isAlive = true; ws.missed = 0; return; }

                if (ws.isAlive === false) {
                    ws.missed = (ws.missed ?? 0) + 1;
                    if (ws.missed >= 3) { try { client.terminate(); } catch { }; return; }
                } else {
                    ws.missed = 0;
                }

                ws.isAlive = false;
                try { client.ping(); } catch { try { client.terminate(); } catch { } }
            });

            if (this.wss.clients.size === 0 && this.timer) { clearInterval(this.timer); this.timer = undefined; }
        }, SWEEP_MS);
    }

    stop() { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }
    suspend(ms: number) { this.suspendUntil = this.now() + ms; }
}
