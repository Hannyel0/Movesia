import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';

type ConnectionStatus = 'connected' | 'disconnected' | 'loading';

// Extend window type for TypeScript
declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}

// Unity connection status icon component
function UnityConnectionIcon({ status }: { status: ConnectionStatus }) {
  // Determine dot color based on connection status
  const getDotColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'; // Green for connected
      case 'disconnected':
        return 'bg-red-500'; // Red for disconnected
      case 'loading':
        return 'bg-yellow-500'; // Yellow for loading
      default:
        return 'bg-gray-500';
    }
  };

  const isLoading = status === 'loading';
  
  return (
    <div className="relative">
      <img 
        src="./assets/icons/white-unity-logo.svg" 
        alt="Unity" 
        className="h-4 w-4 opacity-60" 
        style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)' }}
      />
      <div className={`absolute -top-1 -right-1 h-2 w-2 ${getDotColor(status)} rounded-full ${
        isLoading ? 'animate-pulse' : ''
      }`} />
    </div>
  );
}

// Connection status details for the popover
function UnityConnectionDetails({ status }: { status: ConnectionStatus }) {
  const getStatusInfo = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return {
          title: 'Unity Connected',
          description: 'Successfully connected to Unity Editor',
          color: 'text-green-600'
        };
      case 'disconnected':
        return {
          title: 'Unity Disconnected',
          description: 'No connection to Unity Editor detected',
          color: 'text-red-600'
        };
      case 'loading':
        return {
          title: 'Checking Connection',
          description: 'Verifying Unity Editor connection...',
          color: 'text-yellow-600'
        };
      default:
        return {
          title: 'Unknown Status',
          description: 'Connection status unavailable',
          color: 'text-gray-600'
        };
    }
  };

  const statusInfo = getStatusInfo(status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <UnityConnectionIcon status={status} />
        <div>
          <h4 className={`font-semibold ${statusInfo.color}`}>
            {statusInfo.title}
          </h4>
          <p className="text-sm text-muted-foreground">
            {statusInfo.description}
          </p>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground">
        <p>
          {status === 'connected' 
            ? 'Real-time communication with Unity Editor is active.'
            : 'Make sure Unity Editor is running with the Movesia plugin enabled.'
          }
        </p>
      </div>
    </div>
  );
}

export function UnityConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('loading');

  useEffect(() => {
    const checkConnectionStatus = async () => {
      try {
        if (window.electron?.ipcRenderer) {
          const isConnected = await window.electron.ipcRenderer.invoke('get-connection-status');
          setStatus(isConnected ? 'connected' : 'disconnected');
        } else {
          console.warn('electron.ipcRenderer not available');
          setStatus('disconnected');
        }
      } catch (error) {
        console.error('Failed to check Unity connection status:', error);
        setStatus('disconnected');
      }
    };

    // Check initial status
    checkConnectionStatus();

    // Poll for status updates every 5 seconds
    const interval = setInterval(checkConnectionStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-9 w-9 p-0 hover:bg-transparent focus:ring-0 focus:ring-offset-0"
          title="Unity connection status"
        >
          <UnityConnectionIcon status={status} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end" side="bottom">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <img 
              src="./assets/icons/white-unity-logo.svg" 
              alt="Unity" 
              className="h-5 w-5 opacity-60" 
              style={{ filter: 'brightness(0) saturate(100%) invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(90%) contrast(90%)' }}
            />
            <h3 className="font-semibold">Unity Connection</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Monitor the connection status with Unity Editor
          </p>
          <UnityConnectionDetails status={status} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
