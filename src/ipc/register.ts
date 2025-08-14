// src/ipc/register.ts
import { ipcMain } from "electron";
import { registerUnityProjectHandlers } from "../main/unity-project-ipc";
import { wipeDatabase } from "../memory/wipe-db";

export function registerIpcHandlers() {
  // Database wipe handler
  ipcMain.handle("wipe-database", async () => {
    return wipeDatabase();
  });

  // Register Unity project handlers
  registerUnityProjectHandlers();
}
