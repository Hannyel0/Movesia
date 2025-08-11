import { BrowserWindow, app, ipcMain } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import path from 'node:path';
import { createAppWindow } from './appWindow';
import { WSChannels, UNITY_CURRENT_PROJECT, UNITY_GET_CURRENT_PROJECT } from './channels/wsChannels';
import { MovesiaWebSocketServer } from './ws/server';
import { startServicesOnce, setGlobalRouter } from './orchestrator';
import { registerIpcHandlers, setConnectionStatus } from './ipc/register';
import { findUnityProjects, enrichWithProductGUID, isUnityProject } from './main/unity-project-scanner';
import { configureReconcile } from './main/reconcile';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  app.quit();
}

// Optional: single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let mainWindow: BrowserWindow | null = null;

// Keep a ref to the last resolved project for the UI
let currentUnityProject: { path: string; name: string; editorVersion?: string } | null = null;

function norm(p: string) {
  // normalize + force forward slashes + drop trailing slash
  return path.normalize(p).replace(/\\/g, "/").replace(/\/+$/, "");
}

app.whenReady().then(async () => {
  console.log("Movesia main: app.ready");

  // Register IPC handlers first
  registerIpcHandlers();

  // Add Unity project IPC handler
  ipcMain.handle(UNITY_GET_CURRENT_PROJECT, async () => currentUnityProject);

  // Initialize core services (SQLite, Qdrant, etc.)
  const { indexer } = await startServicesOnce();
  configureReconcile({ indexer });
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
        const h = msg.body as {
          productGUID?: string;
          cloudProjectId?: string;
          unityVersion?: string;
          dataPath?: string; // often missing in your payload
        };

        const projects  = await findUnityProjects();
        const enriched  = await enrichWithProductGUID(projects);
        const helloGUID = (h.productGUID || "").toLowerCase();

        let pick =
          enriched.find(p => (p.productGUID || "").toLowerCase() === helloGUID) || null;

        // Fallback A: dataPath → <root> if you actually got a string
        if (!pick && h.dataPath) {
          const rootFromDataPath = norm(path.resolve(h.dataPath, ".."));
          pick = enriched.find(p => norm(p.path) === rootFromDataPath)
              || (await isUnityProject(rootFromDataPath)) || null;
        }

        // 🔧 Fallback B: _sessionRoot provided by the WS layer (your case)
        // The WS server already mapped the session; use that root now (even on hello).
        if (!pick) {
          const resolvedRootFromWS = (msg as any)._sessionRoot as string | undefined;
          if (resolvedRootFromWS) {
            const root = norm(resolvedRootFromWS);
            pick = enriched.find(p => norm(p.path) === root)
                || (await isUnityProject(root)) || null;
          }
        }

        // (optional) Fallback C: unityVersion tiebreaker
        if (!pick && h.unityVersion) {
          const major = h.unityVersion.split(".")[0];
          pick = enriched.find(p => p.editorVersion?.startsWith(major)) || null;
        }

        if (pick) {
          const p = norm(pick.path);
          indexer.setSessionRoot(msg.session ?? "default", p);
          indexer.setProjectRoot(p);
          currentUnityProject = { path: p, name: pick.name, editorVersion: pick.editorVersion };

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(UNITY_CURRENT_PROJECT, currentUnityProject);
          }

          return;
        }

        console.warn("Could not match hello to any known Unity project; paths will fail until user picks one.");
        return;
      }

      // If the router already resolved a root, teach the indexer before routing
      const session = msg.session ?? "default";
      const resolvedRoot = (msg as any)._sessionRoot;
      if (resolvedRoot) {
        // set per-session root; optional: also set default project root
        indexer.setSessionRoot(session, resolvedRoot);
        // indexer.setProjectRoot(resolvedRoot); // optional fallback if you want one

        // if we didn't set a project on hello, synthesize it now
        const proj = await isUnityProject(resolvedRoot);
        if (proj) {
          const p = norm(proj.path);
          currentUnityProject = { path: p, name: proj.name, editorVersion: proj.editorVersion };
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(UNITY_CURRENT_PROJECT, currentUnityProject);
          }
        }
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
