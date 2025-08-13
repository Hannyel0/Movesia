import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
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

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-2 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Indexing Status Unavailable
          </CardTitle>
          <CardDescription>
            Unable to connect to indexing service
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const config = phaseConfig[status.phase];
  const Icon = config.icon;
  const progress = status.total > 0 ? (status.done / status.total) * 100 : 0;
  const isActive = status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error';
  


  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="relative">
            <Icon className={`h-5 w-5 text-white`} />
            <div className={`absolute inset-0 ${config.color} rounded-full opacity-20 ${isActive ? 'animate-pulse' : ''}`} />
          </div>
          Index Status
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          {config.description}
          {status.message && ` • ${status.message}`}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        {status.total > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {status.done} / {status.total} files
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-xs text-muted-foreground text-right">
              {Math.round(progress)}% complete
            </div>
          </div>
        )}

        {/* Current File */}
        {status.lastFile && (
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Current File</div>
            <div className="text-sm font-mono bg-muted px-2 py-1 rounded truncate" title={status.lastFile}>
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
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="text-sm font-medium text-destructive mb-1">Error</div>
            <div className="text-xs text-destructive/80 font-mono">{status.error}</div>
          </div>
        )}

        {/* Success Message */}
        {status.phase === 'complete' && status.total > 0 && (
          <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
            <div className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
              Indexing Complete
            </div>
            <div className="text-xs text-green-600 dark:text-green-400">
              Successfully indexed {status.total} files
              {status.qdrantPoints && ` with ${status.qdrantPoints.toLocaleString()} vector embeddings`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Export alias for backward compatibility
export { IndexingStatusComponent as IndexingStatus };
