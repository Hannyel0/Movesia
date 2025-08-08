import chalk from 'chalk';
import { BrowserWindow, app } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

import { createAppWindow } from './appWindow';
import { WSChannels } from './channels/wsChannels';
import type { WebSocketMessage, CommandMessage, UnityCommand } from './types/websocket';
import { registerUnityProjectHandlers } from './main/unity-project-ipc';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
/**
 * Handle Unity commands received via WebSocket
 */
function handleCommand(ws: WebSocket, data: CommandMessage) {
  console.log(chalk.yellow(`Received command: ${JSON.stringify(data.payload)}`));

  try {
    // Check if payload exists and is a valid object
    if (data.payload && typeof data.payload === 'object' && 'action' in data.payload) {
      const unityCommand = data.payload as UnityCommand;

      switch (unityCommand.action) {
        case 'move':
          console.log(chalk.magenta(`Moving object ${unityCommand.target} to:`), unityCommand.parameters);
          break;
        case 'rotate':
          console.log(chalk.magenta(`Rotating object ${unityCommand.target}:`), unityCommand.parameters);
          break;
        case 'scale':
          console.log(chalk.magenta(`Scaling object ${unityCommand.target}:`), unityCommand.parameters);
          break;
        case 'animate':
          console.log(chalk.magenta(`Animating object ${unityCommand.target}:`), unityCommand.parameters);
          break;
        case 'trigger':
          console.log(chalk.magenta(`Triggering event ${unityCommand.target}:`), unityCommand.parameters);
          break;
        case 'custom':
          console.log(chalk.magenta(`Custom command for ${unityCommand.target}:`), unityCommand.parameters);
          break;
        default:
          console.log(chalk.magenta(`Unknown Unity action: ${unityCommand.action}`));
      }
    }

    // Send success response
    ws.send(JSON.stringify({
      type: 'commandResponse',
      success: true,
      payload: `Command executed successfully`,
      id: data.id,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error(chalk.red('Error handling command:'), error);
    ws.send(JSON.stringify({
      type: 'commandResponse',
      success: false,
      payload: `Error executing command: ${error}`,
      id: data.id,
      timestamp: new Date().toISOString()
    }));
  }
}

/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  app.quit();
}

// Track WebSocket connection status
let isConnectedToUnity = false;
let mainWindow: BrowserWindow | null = null;

// Function to update connection status in the renderer
function updateConnectionStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(WSChannels.CONNECTION_STATUS, isConnectedToUnity);
  }
}

app.whenReady().then(() => {
  // Get the window instance from createAppWindow
  mainWindow = createAppWindow();

  // Register Unity project IPC handlers
  registerUnityProjectHandlers();

  // Send initial connection status to renderer
  updateConnectionStatus();

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

  // Start WebSocket server for IPC communication
  const wss = new WebSocketServer({ port: 8765 });
  console.log(chalk.cyan('WebSocket server is listening on ws://localhost:8765'));



  wss.on('connection', (ws) => {
    console.log(chalk.green('WebSocket client connected'));
    isConnectedToUnity = true;
    updateConnectionStatus();

    // Send a greeting/handshake message
    ws.send(JSON.stringify({
      type: 'hello',
      payload: 'Connected to Electron WebSocket server',
      timestamp: new Date().toISOString()
    }));



    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString());
        console.log(`Unity→Electron: ${JSON.stringify(data)}`);

        // Handle different message types
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: new Date().toISOString()
            }));
            break;

          case 'command':
            handleCommand(ws, data as CommandMessage);
            break;

          default:
            console.log(`Unknown message type: ${data.type}`);
            ws.send(JSON.stringify({
              type: 'error',
              payload: `Unknown message type: ${data.type}`
            }));
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          payload: 'Invalid message format'
        }));
      }
    });



    // Handle client disconnect
    ws.on('close', () => {
      console.log(chalk.yellow('WebSocket client disconnected'));
      isConnectedToUnity = false;
      updateConnectionStatus();
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  wss.on('listening', () => {
    console.log('WebSocket server listening on ws://localhost:8765');
  });

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });
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
 * In this file you can include the rest of your app's specific main process code.
 * You can also put them in separate files and import them here.
 */
