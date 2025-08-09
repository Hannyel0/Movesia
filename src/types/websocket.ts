/**
 * Movesia WebSocket message types for Unity-Electron communication
 */

// Extended WebSocket interface with heartbeat properties
export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  missed: number;
  lastSeen: number;
  cid: string; // Connection ID for logging
}

// Message body types
export interface WelcomeBody {
  message: string;
  timestamp: string;
}

export interface AckBody {
  ok: boolean;
  id: string;
  timestamp: string;
}

export interface BroadcastMessage {
  type: string;
  body: Record<string, unknown>;
}
