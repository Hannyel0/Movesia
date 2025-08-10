// src/ipc/register.ts
import { ipcMain } from "electron";
import { registerUnityProjectHandlers } from "../main/unity-project-ipc";

// Track WebSocket connection status (will be updated by main.ts)
let isConnectedToUnity = false;

export function setConnectionStatus(connected: boolean) {
  isConnectedToUnity = connected;
}

export function registerIpcHandlers() {
  // Connection status handler
  ipcMain.handle("get-connection-status", async () => {
    return isConnectedToUnity;
  });

  // Register Unity project handlers
  registerUnityProjectHandlers();
}
