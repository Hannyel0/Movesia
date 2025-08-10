export type UnityProject = {
  path: string;
  name: string;
  editorVersion?: string;
};

export interface UnityProjectIPC {
  'unity:scan-projects': (extraRoots?: string[]) => Promise<UnityProject[]>;
  'unity:validate-project': (projectPath: string) => Promise<UnityProject | null>;
  'unity:select-project-dialog': () => Promise<UnityProject | null>;
  'unity:get-hub-candidates': () => Promise<string[]>;
  'unity:get-current-project': () => Promise<UnityProject | null>;
  'get-connection-status': () => Promise<boolean>;
  'wipe-database': () => Promise<{ success: boolean; message: string }>;
}

// Extend the global electron interface
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke<K extends keyof UnityProjectIPC>(
          channel: K,
          ...args: Parameters<UnityProjectIPC[K]>
        ): ReturnType<UnityProjectIPC[K]>;
        on?(channel: string, listener: (event: unknown, ...args: unknown[]) => void): (() => void) | undefined;
        removeListener?(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
      };
    };
  }
}
