import { BrowserWindow, app } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import path from 'node:path';
import { createAppWindow } from './appWindow';
import { WSChannels } from './channels/wsChannels';
import { MovesiaWebSocketServer } from './ws/server';
import { startServicesOnce } from './orchestrator';
import { registerIpcHandlers, setConnectionStatus } from './ipc/register';
import { findUnityProjects, enrichWithProductGUID } from './main/unity-project-scanner';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  app.quit();
}

// Optional: single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  console.log("Movesia main: app.ready");

  // Register IPC handlers first
  registerIpcHandlers();

  // Initialize core services (SQLite, Qdrant, etc.)
  const { indexer } = await startServicesOnce();
  console.log("✅ Core services initialized");

  // Get the window instance from createAppWindow
  mainWindow = createAppWindow();

  // Install React Developer Tools using modern Electron API
  if (process.env.NODE_ENV === 'development') {
    installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
      forceDownload: false
    })
      .then((_extensionPath) => {
        console.info(`Added Extension: React Developer Tools`);
      })
      .catch((err) => {
        console.info('DevTools installation failed:', err);
      });
  }

  // Start Movesia WebSocket server for Unity communication
  const sessionRoots = new Map<string, string>(); // sessionId -> projectRoot

  const server = new MovesiaWebSocketServer({
    port: 8765,
    onConnectionChange(connected) {
      setConnectionStatus(connected);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(WSChannels.CONNECTION_STATUS, connected);
      }
    },
    onDomainEvent: async (msg) => {
      if (msg.type === "hello") {
        const h = msg.body as { productGUID?: string, cloudProjectId?: string, unityVersion?: string };
        const projects = await findUnityProjects();                // your existing finder
        const enriched = await enrichWithProductGUID(projects);    // add productGUIDs

        // 1) Try productGUID match (strongest)
        let pick = enriched.find(p => p.productGUID && p.productGUID.toLowerCase() === String(h.productGUID || "").toLowerCase());

        // (Optional) 2) If you persist cloudProjectId->path in SQLite, you can try it here.

        // (Optional) 3) If ambiguous, filter by version as a tie-breaker
        if (!pick && h.unityVersion) {
          pick = enriched.find(p => p.editorVersion && p.editorVersion.startsWith(h.unityVersion.split('.')[0]));
        }

        if (pick) {
          sessionRoots.set(msg.session ?? "default", pick.path);
          indexer.setSessionRoot(msg.session ?? "default", pick.path);
          indexer.setProjectRoot(pick.path); // default/fallback for single-session
          console.log("🎯 Matched session to project:", pick.path);
          return;
        }

        console.warn("Could not match hello to any known Unity project; paths will fail until user picks one.");
        // TODO: emit a UI prompt listing 'projects' to let the user select one; then call setSessionRoot
        return;
      }

      // If the router already resolved a root, teach the indexer before routing
      const session = msg.session ?? "default";
      const resolvedRoot = (msg as any)._sessionRoot as string | undefined;
      if (resolvedRoot) {
        // set per-session root; optional: also set default project root
        indexer.setSessionRoot(session, resolvedRoot);
        // indexer.setProjectRoot(resolvedRoot); // optional fallback if you want one

      }

      // For asset/scene events: resolve using the session root
      await indexer.handleUnityEvent({
        ts: msg.ts, type: msg.type, session: msg.session, body: msg.body as Record<string, unknown>
      });
    }
  });

  try {
    await server.start();
    console.log("✅ WebSocket server started");
  } catch (e) {
    console.error('❌ Failed to start WS:', e);
  }
});



/**
 * Emitted when the application is activated. Various actions can
 * trigger this event, such as launching the application for the first time,
 * attempting to re-launch the application when it's already running,
 * or clicking on the application's dock or taskbar icon.
 */
app.on('activate', () => {
  /**
   * On OS X it's common to re-create a window in the app when the
   * dock icon is clicked and there are no other windows open.
   */
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createAppWindow();
  }
});

/**
 * Emitted when all windows have been closed.
 */
app.on('window-all-closed', () => {
  /**
   * On OS X it is common for applications and their menu bar
   * to stay active until the user quits explicitly with Cmd + Q
   */
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Clean up when app is about to quit
 */
app.on('before-quit', async () => {
  console.log('App shutting down...');
});

/**
 * In this file you can include the rest of your app's specific main process code.
 * You can also put them in separate files and import them here.
 */
