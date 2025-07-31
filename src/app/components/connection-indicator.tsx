import { useRendererListener } from '@/app/hooks';
import { WSChannels } from '@/channels/wsChannels';

import { useState } from 'react';

export default function ConnectionIndicator() {
  const [isConnected, setIsConnected] = useState(false);

  // Listen for connection status updates from main process
  useRendererListener(WSChannels.CONNECTION_STATUS, (_, connected: boolean) => {
    setIsConnected(connected);
  });

  return (
    <div className="flex items-center ml-2">
      <div 
        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
        title={isConnected ? 'Connected to Unity' : 'Not connected to Unity'}
      />
      <span className="ml-2 text-xs text-gray-400">
        {isConnected ? 'Unity Connected' : 'Unity Disconnected'}
      </span>
    </div>
  );
}
