import { BrowserWindow, app, ipcMain } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type Database from 'better-sqlite3';
import { createAppWindow } from './appWindow';
import { WSChannels, UNITY_CURRENT_PROJECT, UNITY_GET_CURRENT_PROJECT } from './channels/wsChannels';
import { MovesiaWebSocketServer } from './ws/server';
import type { MovesiaMessage } from './ws/types';
import { startServicesOnce } from './orchestrator';
import { registerIpcHandlers } from './ipc/register';
import { findUnityProjects, enrichWithProductGUID, isUnityProject } from './main/unity-project-scanner';
import { configureReconcile } from './main/reconcile';
import { indexingBus } from './memory/progress';
import type { IndexingStatus } from './shared/indexing-types';
import { readIndexState } from './memory/sqlite';
import { computeSnapshotFromAssets, computeProjectId } from './memory/indexer';

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

// Connection event bus for project connect/disconnect events
export const bus = new EventEmitter();

// Track Unity connection status and indexing status
let unityConnected = false;
let lastIndexingStatus: IndexingStatus = { phase: 'idle', total: 0, done: 0 };

// Push indexing status to renderer and cache it
function pushIndexingStatus(win: BrowserWindow, status: IndexingStatus) {
  lastIndexingStatus = status;                            // keep cache in sync
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
    win.webContents.send('indexing:status', status);     // push to renderer
  }
}

// Verify and announce index status on project connection
async function verifyAndAnnounceIndexStatus(db: Database.Database, projectId: string) {
  try {
    const { sha, total } = computeSnapshotFromAssets(db);
    const prior = readIndexState(db, projectId);

    if (prior && prior.snapshot_sha === sha && prior.total_items === total) {
      const s: IndexingStatus = {
        phase: 'complete',
        total,
        done: total,
        qdrantPoints: prior.qdrant_count ?? undefined,
        message: 'Fully indexed (verified)',
      };
      // Use the new pushIndexingStatus function
      for (const win of BrowserWindow.getAllWindows()) pushIndexingStatus(win, s);
    } else {
      const s: IndexingStatus = { phase: 'scanning', total: 0, done: 0, message: 'Checking for changes…' };
      // Use the new pushIndexingStatus function
      for (const win of BrowserWindow.getAllWindows()) pushIndexingStatus(win, s);
    }
  } catch (error) {
    console.warn('Failed to verify index status:', error);
  }
}

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

  // Add indexing status IPC handlers
  ipcMain.handle('indexing:getStatus', async () => {
    // Hydrate: if Unity isn't connected, force idle so UI can't get stuck on "complete"
    return unityConnected ? lastIndexingStatus : { phase: 'idle' as const, total: 0, done: 0 };
  });

  // Add connection status IPC handler (single source of truth)
  ipcMain.handle('get-connection-status', () => unityConnected);

  // Bridge indexing events to all renderer windows
  indexingBus.on('status', (status: IndexingStatus) => {
    for (const win of BrowserWindow.getAllWindows()) {
      pushIndexingStatus(win, status);
    }
  });

  // Wire connection events
  bus.on('project-connected', () => {
    unityConnected = true;
    console.log('🔗 Unity project connected');
  });

  bus.on('project-disconnected', () => {
    unityConnected = false;
    currentUnityProject = null;
    console.log('🔌 Unity project disconnected');
    
    // Clear current project in all windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(UNITY_CURRENT_PROJECT, null);
      }
    }
    
    // IMPORTANT: flip indexing back to idle when Unity closes
    const idleStatus: IndexingStatus = { phase: 'idle', total: 0, done: 0, message: 'Unity disconnected' };
    for (const win of BrowserWindow.getAllWindows()) {
      pushIndexingStatus(win, idleStatus);
    }
  });

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

  const server = new MovesiaWebSocketServer({
    port: 8765,
    onConnectionChange(connected) {
      // Broadcast connection status to all windows
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(WSChannels.CONNECTION_STATUS, connected);
        }
      }
      
      // Emit connection events for the orchestrator
      if (connected) {
        bus.emit('project-connected');
      } else {
        bus.emit('project-disconnected');
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
          const resolvedRootFromWS = (msg as MovesiaMessage & { _sessionRoot?: string })._sessionRoot;
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
          const projectId = computeProjectId(p);  // ← same id writer uses
          indexer.setSessionRoot(msg.session ?? "default", p);
          indexer.setProjectRoot(p);
          currentUnityProject = { path: p, name: pick.name, editorVersion: pick.editorVersion };

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(UNITY_CURRENT_PROJECT, currentUnityProject);
          }

          // Verify and announce index status for connected project
          const { db } = await startServicesOnce();
          await verifyAndAnnounceIndexStatus(db, projectId); // ← pass the matched id

          return;
        }

        console.warn("Could not match hello to any known Unity project; paths will fail until user picks one.");
        return;
      }

      // If the router already resolved a root, teach the indexer before routing
      const session = msg.session ?? "default";
      const resolvedRoot = (msg as MovesiaMessage & { _sessionRoot?: string })._sessionRoot;
      if (resolvedRoot) {
        // set per-session root; optional: also set default project root
        indexer.setSessionRoot(session, resolvedRoot);
        // indexer.setProjectRoot(resolvedRoot); // optional fallback if you want one

        // if we didn't set a project on hello, synthesize it now
        const proj = await isUnityProject(resolvedRoot);
        if (proj) {
          const p = norm(proj.path);
          const projectId = computeProjectId(p);  // ← same id writer uses
          currentUnityProject = { path: p, name: proj.name, editorVersion: proj.editorVersion };
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(UNITY_CURRENT_PROJECT, currentUnityProject);
          }

          // Verify and announce index status for connected project
          const { db } = await startServicesOnce();
          await verifyAndAnnounceIndexStatus(db, projectId); // ← pass the matched id
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
