import type { RendererListener } from '@/preload';

import { useEffect, useCallback, useRef } from 'react';

export const useRendererListener = (channel: string, listener: RendererListener) => {
  const listenerRef = useRef(listener);
  
  // Update the ref when listener changes
  useEffect(() => {
    listenerRef.current = listener;
  }, [listener]);

  // Stable wrapper function that doesn't change on every render
  const stableListener = useCallback((event: Electron.IpcRendererEvent, ...args: unknown[]) => {
    listenerRef.current(event, ...args);
  }, []);

  useEffect(() => {
    electron.ipcRenderer.on(channel, stableListener);
    return () => {
      electron.ipcRenderer.removeListener(channel, stableListener);
    };
  }, [channel, stableListener]);
};
