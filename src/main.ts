import { BrowserWindow, app, ipcMain } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import chalk from 'chalk';
import { createAppWindow } from './appWindow';
import { registerUnityProjectHandlers } from './main/unity-project-ipc';
import { WSChannels } from './channels/wsChannels';
import { MovesiaWebSocketServer } from './ws/server';
import { startServices } from './orchestrator';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';



/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  app.quit();
}

// Track WebSocket connection status
let isConnectedToUnity = false;
let mainWindow: BrowserWindow | null = null;
let wsServer: MovesiaWebSocketServer | null = null;

// Function to update connection status in the renderer
function updateConnectionStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(WSChannels.CONNECTION_STATUS, isConnectedToUnity);
  }
}

app.whenReady().then(async () => {
  console.log("Movesia main: app.ready");
  
  // Initialize core services (SQLite, Qdrant, etc.)
  try {
    await startServices();
    console.log("✅ Core services initialized");
  } catch (err) {
    console.error("❌ Service initialization error:", err);
  }

  // Get the window instance from createAppWindow
  mainWindow = createAppWindow();

  // Register Unity project IPC handlers
  registerUnityProjectHandlers();

  // Register connection status IPC handler
  ipcMain.handle('get-connection-status', () => {
    return isConnectedToUnity;
  });

  // Send initial connection status to renderer after a short delay to ensure renderer is ready
  setTimeout(() => {
    updateConnectionStatus();
  }, 100);

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
  wsServer = new MovesiaWebSocketServer({
    port: 8765,
    onConnectionChange: (connected: boolean) => {
      isConnectedToUnity = connected;
      updateConnectionStatus();
    }
  });

  // Start the WebSocket server
  try {
    await wsServer.start();
  } catch (error) {
    console.error(chalk.red('Failed to start WebSocket server:'), error);
  }
});

/**
 * This method will be called when Electron has finished
 * initialization and is ready to create browser windows.
 * Some APIs can only be used after this event occurs.
 */
app.on('ready', createAppWindow);

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
    createAppWindow();
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
 * Clean up WebSocket server when app is about to quit
 */
app.on('before-quit', async () => {
  if (wsServer) {
    console.log(chalk.yellow('Shutting down WebSocket server...'));
    await wsServer.stop();
  }
});

/**
 * In this file you can include the rest of your app's specific main process code.
 * You can also put them in separate files and import them here.
 */
