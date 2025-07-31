/**
 * WebSocket message types for IPC communication between Unity and Electron
 */

export interface BaseMessage {
  type: string;
  timestamp?: string;
}

export interface HelloMessage extends BaseMessage {
  type: 'hello';
  payload: string;
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
}

export interface CommandMessage extends BaseMessage {
  type: 'command';
  payload: string | object | null;
  id?: string;
}

export interface CommandResponseMessage extends BaseMessage {
  type: 'commandResponse';
  success: boolean;
  payload: string;
  id?: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  payload: string;
}

export type WebSocketMessage = 
  | HelloMessage 
  | PingMessage 
  | PongMessage 
  | CommandMessage 
  | CommandResponseMessage 
  | ErrorMessage;

/**
 * Unity-specific command types
 */
export interface UnityCommand {
  action: 'move' | 'rotate' | 'scale' | 'animate' | 'trigger' | 'custom';
  target?: string;
  parameters?: Record<string, unknown>;
}

export interface UnityCommandMessage extends CommandMessage {
  payload: UnityCommand;
}
