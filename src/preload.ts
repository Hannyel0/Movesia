import { type IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';

const versions: Record<string, unknown> = {};

// Process versions
for (const type of [
  'chrome',
  'node',
  'electron'
]) {
  versions[type] = process.versions[type];
}

function validateIPC (channel: string) {
  if (!channel) {
    throw new Error(`Unsupported event IPC channel '${channel}'`);
  }

  return true;
}

export type RendererListener = (event: IpcRendererEvent, ...args: unknown[]) => void;

export const globals = {
  /** Processes versions **/
  versions,

  /**
   * A minimal set of methods exposed from Electron's `ipcRenderer`
   * to support communication to main process.
   */
  ipcRenderer: {
    send (channel: string, ...args: unknown[]) {
      if (validateIPC(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },

    invoke (channel: string, ...args: unknown[]) {
      if (validateIPC(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
    },

    on (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.on(channel, listener);

        return this;
      }
    },

    once (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.once(channel, listener);

        return this;
      }
    },

    removeListener (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.removeListener(channel, listener);

        return this;
      }
    }
  }
};

// Indexing status API
type IndexingStatus = {
  phase: 'idle' | 'scanning' | 'embedding' | 'writing' | 'qdrant' | 'complete' | 'error';
  total: number;
  done: number;
  lastFile?: string;
  qdrantPoints?: number;
  message?: string;
  error?: string;
};

const indexingAPI = {
  getStatus: () => ipcRenderer.invoke('indexing:getStatus') as Promise<IndexingStatus>,
  onStatus: (callback: (status: IndexingStatus) => void) => {
    const handler = (_e: unknown, status: IndexingStatus) => callback(status);
    ipcRenderer.on('indexing:status', handler);
    return () => ipcRenderer.removeListener('indexing:status', handler);
  }
};

// Connection status API
const connectionAPI = {
  get: () => ipcRenderer.invoke('get-connection-status') as Promise<boolean>,
  onStatus: (callback: (connected: boolean) => void) => {
    const handler = (_e: unknown, connected: boolean) => callback(connected);
    ipcRenderer.on('connection-status', handler); // same as WSChannels.CONNECTION_STATUS
    return () => ipcRenderer.removeListener('connection-status', handler);
  }
};

// Create a safe, bidirectional, synchronous bridge across isolated contexts
// When contextIsolation is enabled in your webPreferences, your preload scripts run in an "Isolated World".
contextBridge.exposeInMainWorld('electron', globals);
contextBridge.exposeInMainWorld('indexingAPI', indexingAPI);
contextBridge.exposeInMainWorld('connectionAPI', connectionAPI);
