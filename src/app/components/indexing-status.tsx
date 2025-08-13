import React, { useEffect, useState } from 'react';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { 
  FileText, 
  Database, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Activity,
  HardDrive
} from 'lucide-react';

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

const phaseConfig = {
  idle: { 
    label: 'Idle', 
    icon: Activity, 
    color: 'bg-gray-500',
    description: 'Waiting for indexing tasks'
  },
  scanning: { 
    label: 'Scanning', 
    icon: Search, 
    color: 'bg-blue-500',
    description: 'Discovering files to index'
  },
  embedding: { 
    label: 'Embedding', 
    icon: FileText, 
    color: 'bg-yellow-500',
    description: 'Processing and embedding content'
  },
  writing: { 
    label: 'Writing', 
    icon: HardDrive, 
    color: 'bg-purple-500',
    description: 'Saving to database'
  },
  qdrant: { 
    label: 'Vector DB', 
    icon: Database, 
    color: 'bg-indigo-500',
    description: 'Updating vector database'
  },
  complete: { 
    label: 'Complete', 
    icon: CheckCircle2, 
    color: 'bg-green-500',
    description: 'Indexing completed successfully'
  },
  error: { 
    label: 'Error', 
    icon: XCircle, 
    color: 'bg-red-500',
    description: 'Indexing encountered an error'
  }
};

// Icon component that shows current status
function IndexingStatusIcon({ status, isLoading }: { status: IndexingStatus | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="relative">
        <Database className="h-5 w-5 text-muted-foreground animate-pulse" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="relative">
        <Database className="h-5 w-5 text-red-500" />
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
      </div>
    );
  }

  const isActive = status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error';
  
  return (
    <div className="relative">
      <Database className={`h-5 w-5 ${
        status.phase === 'error' ? 'text-red-500' :
        status.phase === 'complete' ? 'text-green-500' :
        isActive ? 'text-blue-500' : 'text-muted-foreground'
      }`} />
      {isActive && (
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
      )}
      {status.phase === 'error' && (
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
      )}
      {status.phase === 'complete' && (
        <div className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full" />
      )}
    </div>
  );
}

// Status details content for the dialog
function IndexingStatusDetails({ status, isLoading }: { status: IndexingStatus | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-2 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-8">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-600 mb-2">Service Unavailable</h3>
        <p className="text-sm text-muted-foreground">
          Unable to connect to indexing service
        </p>
      </div>
    );
  }

  const config = phaseConfig[status.phase];
  const Icon = config.icon;
  const progress = status.total > 0 ? (status.done / status.total) * 100 : 0;
  const isActive = status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error';

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`p-2 rounded-full ${config.color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          {isActive && (
            <div className="absolute inset-0 rounded-full bg-current opacity-20 animate-pulse" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{config.label}</h3>
            {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-sm text-muted-foreground">
            {config.description}
            {status.message && ` • ${status.message}`}
          </p>
        </div>
      </div>

      {/* Progress Section */}
      {status.total > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="text-muted-foreground">
              {status.done} / {status.total} files
            </span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="text-xs text-muted-foreground text-right">
            {Math.round(progress)}% complete
          </div>
        </div>
      )}

      {/* Current File */}
      {status.lastFile && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Current File</div>
          <div className="text-sm font-mono bg-muted px-3 py-2 rounded-md truncate border" title={status.lastFile}>
            {status.lastFile}
          </div>
        </div>
      )}

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <Badge 
          variant={status.phase === 'error' ? 'destructive' : status.phase === 'complete' ? 'default' : 'secondary'}
          className="flex items-center gap-1"
        >
          <Icon className="h-3 w-3" />
          {config.label}
        </Badge>
        
        {typeof status.qdrantPoints === 'number' && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            {status.qdrantPoints.toLocaleString()} points
          </Badge>
        )}
      </div>

      {/* Error Message */}
      {status.error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <div className="text-sm font-medium text-destructive">Error Details</div>
          </div>
          <div className="text-xs text-destructive/80 font-mono bg-destructive/5 p-2 rounded border">
            {status.error}
          </div>
        </div>
      )}

      {/* Success Message */}
      {status.phase === 'complete' && status.total > 0 && (
        <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div className="text-sm font-medium text-green-800 dark:text-green-200">
              Indexing Complete
            </div>
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">
            Successfully indexed {status.total} files
            {status.qdrantPoints && ` with ${status.qdrantPoints.toLocaleString()} vector embeddings`}
          </div>
        </div>
      )}
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
      <PopoverContent className="w-[480px] p-0" align="end" side="bottom">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5" />
            <h3 className="font-semibold">Indexing Status</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Monitor the progress of your project indexing
          </p>
          <IndexingStatusDetails status={status} isLoading={isLoading} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Export alias for backward compatibility
export { IndexingStatusComponent as IndexingStatus };
