import { useEffect, useState } from 'react';

type IndexingPhase = 'idle' | 'scanning' | 'embedding' | 'writing' | 'qdrant' | 'complete' | 'error';

type IndexingStatus = {
  phase: IndexingPhase;
  total: number;
  done: number;
  lastFile?: string;
  qdrantPoints?: number;
  message?: string;
  error?: string;
};

// Extend window type for TypeScript
declare global {
  interface Window {
    indexingAPI: {
      getStatus: () => Promise<IndexingStatus>;
      onStatus: (callback: (status: IndexingStatus) => void) => () => void;
    };
  }
}

export function useIndexingStatus() {
  const [status, setStatus] = useState<IndexingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initializeStatus = async () => {
      try {
        if (window.indexingAPI) {
          // Get initial status
          const initialStatus = await window.indexingAPI.getStatus();
          
          // Just use the status as-is from main process
          setStatus(initialStatus);
          setIsLoading(false);

          // Subscribe to status updates
          cleanup = window.indexingAPI.onStatus((newStatus) => {
            setStatus(newStatus);
            setError(null); // Clear any previous errors
          });
        } else {
          setError('Indexing API not available');
          setIsLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize indexing status');
        setIsLoading(false);
      }
    };

    initializeStatus();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const progress = status && status.total > 0 ? (status.done / status.total) * 100 : 0;
  const isActive = status?.phase !== 'idle' && status?.phase !== 'complete' && status?.phase !== 'error';

  return {
    status,
    isLoading,
    error,
    progress,
    isActive,
    isComplete: status?.phase === 'complete',
    hasError: status?.phase === 'error' || !!error,
  };
}
