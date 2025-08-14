import React, { useEffect, useState } from 'react';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import type { IndexingStatus, IndexingPhase } from '../../shared/indexing-types';

// Extend window type for TypeScript
declare global {
  interface Window {
    indexingAPI: {
      getStatus: () => Promise<IndexingStatus>;
      onStatus: (callback: (status: IndexingStatus) => void) => () => void;
    };
    connectionAPI: {
      get: () => Promise<boolean>;
      onStatus: (callback: (connected: boolean) => void) => () => void;
    };
  }
}

// Icon component that shows current status
function IndexingStatusIcon({ status, isLoading }: { status: IndexingStatus | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="relative">
        <Database className="h-4 w-4 opacity-60" style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)' }} />
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-yellow-500 rounded-full animate-pulse" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="relative">
        <Database className="h-4 w-4 opacity-60" style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)' }} />
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
      </div>
    );
  }

  // Determine dot color based on status
  const getDotColor = (phase: IndexingPhase) => {
    switch (phase) {
      case 'complete':
        return 'bg-green-500';
      case 'idle':
        return 'bg-blue-500';
      case 'scanning':
      case 'embedding':
      case 'writing':
      case 'qdrant':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const isActive = ['scanning', 'embedding', 'writing', 'qdrant'].includes(status.phase);
  
  return (
    <div className="relative">
      <Database className="h-4 w-4 opacity-60" style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)' }} />
      <div className={`absolute -top-1 -right-1 h-2 w-2 ${getDotColor(status.phase)} rounded-full ${
        isActive ? 'animate-pulse' : ''
      }`} />
    </div>
  );
}

// Minimalistic status details content matching the user's design
function IndexingStatusDetails({ status, isLoading }: { status: IndexingStatus | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-white">Loading...</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-6">
        <XCircle className="h-5 w-5 text-red-500 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Service unavailable</p>
      </div>
    );
  }

  const progress = status.total > 0 ? (status.done / status.total) * 100 : 0;

  // Handle different states based on your design
  if (status.phase === 'idle') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-blue-500" />
          <span className="text-blue-500 font-medium">Idle</span>
        </div>
      </div>
    );
  }

  if (status.phase === 'complete' && status.total > 0) {
    return (
      <div className="space-y-3 p-5">
        {/* Status title */}
        <div className="text-green-500 font-medium text-sm">Fully indexed</div>
        
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={100} className="h-2" />
          <div className="text-right text-xs text-gray-400">
            100% indexed
          </div>
        </div>
      </div>
    );
  }

  if (status.phase === 'error') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-500 font-medium">Indexing Error</span>
        </div>
      </div>
    );
  }

  // Active indexing states
  return (
    <div className="space-y-3">
      {/* Status title */}
      <div className="text-yellow-500 font-medium text-sm flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Indexing...
      </div>
      
      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <div className="text-right text-xs text-gray-400">
          {Math.round(progress)}% indexed
        </div>
      </div>
    </div>
  );
}

// Footer component with status messages
function IndexingStatusFooter({ status, isLoading }: { status: IndexingStatus | null; isLoading: boolean }) {
  const [unityConnected, setUnityConnected] = useState(false);

  useEffect(() => {
    let connectionCleanup: (() => void) | undefined;

    const initializeConnectionStatus = async () => {
      try {
        if (window.connectionAPI) {
          // Get initial connection status
          const connected = await window.connectionAPI.get();
          setUnityConnected(connected);

          // Subscribe to connection status changes
          connectionCleanup = window.connectionAPI.onStatus((connected) => {
            setUnityConnected(connected);
          });
        }
      } catch (error) {
        console.warn('Failed to initialize connection status in footer:', error);
        setUnityConnected(false);
      }
    };

    initializeConnectionStatus();

    return () => {
      if (connectionCleanup) connectionCleanup();
    };
  }, []);

  if (isLoading) {
    return null;
  }

  // Show different footer messages based on status
  const getFooterMessage = () => {
    if (!unityConnected) {
      return {
        icon: AlertTriangle,
        text: "Not connected to unity",
        iconColor: "text-orange-500",
        textColor: "text-gray-400"
      };
    }

    if (status?.phase === 'complete' && status.total > 0) {
      return {
        icon: CheckCircle2,
        text: "Project fully indexed (verified)",
        iconColor: "text-green-500",
        textColor: "text-gray-400"
      };
    }

    if (status?.phase === 'idle') {
      return {
        icon: Database,
        text: "Idle",
        iconColor: "text-blue-500",
        textColor: "text-gray-400"
      };
    }

    return null;
  };

  const footerInfo = getFooterMessage();

  if (!footerInfo) {
    return null;
  }

  const FooterIcon = footerInfo.icon;

  return (
    <div className="pt-1 border-t border-gray-700">
      <div className="flex items-center gap-2">
        <FooterIcon className={`h-3 w-3 ${footerInfo.iconColor}`} />
        <span className={`text-xs ${footerInfo.textColor}`}>
          {footerInfo.text}
        </span>
      </div>
    </div>
  );
}

export function IndexingStatusComponent() {
  const [status, setStatus] = useState<IndexingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initializeStatus = async () => {
      try {
        // Get initial status
        if (window.indexingAPI) {
          const initialStatus = await window.indexingAPI.getStatus();
          setStatus(initialStatus);
          setIsLoading(false);

          // Subscribe to status updates
          cleanup = window.indexingAPI.onStatus((newStatus) => {
            setStatus(newStatus);
          });
        } else {
          console.warn('indexingAPI not available');
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize indexing status:', error);
        setIsLoading(false);
      }
    };

    initializeStatus();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Event-driven connection status guard (replaces polling)
  useEffect(() => {
    let connectionCleanup: (() => void) | undefined;

    const initializeConnectionStatus = async () => {
      try {
        if (window.connectionAPI) {
          // Get initial connection status
          const connected = await window.connectionAPI.get();
          if (!connected) {
            setStatus((s) => (s?.phase === 'idle' ? s : { phase: 'idle', total: 0, done: 0 }));
          }

          // Subscribe to connection status changes
          connectionCleanup = window.connectionAPI.onStatus((connected) => {
            if (!connected) {
              // If disconnected, ensure status reads idle
              setStatus((s) => (s?.phase === 'idle' ? s : { phase: 'idle', total: 0, done: 0 }));
            }
          });
        }
      } catch (error) {
        console.warn('Failed to initialize connection status:', error);
      }
    };

    initializeConnectionStatus();

    return () => {
      if (connectionCleanup) connectionCleanup();
    };
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-9 w-9 p-0 hover:bg-transparent focus:ring-0 focus:ring-offset-0"
          title="View indexing status"
        >
          <IndexingStatusIcon status={status} isLoading={isLoading} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end" side="bottom">
        <div className="p-2">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4" />
            <h3 className="font-medium text-sm">Indexing Status</h3>
          </div>
          <IndexingStatusDetails status={status} isLoading={isLoading} />
          <IndexingStatusFooter status={status} isLoading={isLoading} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export alias for backward compatibility
export { IndexingStatusComponent as IndexingStatus };
